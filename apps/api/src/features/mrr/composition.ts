import { readFile } from 'node:fs/promises';
import {
  createOperationalRepository,
  createPostgresOperationalRepository,
  type OperationalRepository,
} from '@executive-bi/operations';
import {
  createGeminiModel,
  createOpenAIModel,
  type InvestigationModel,
} from '@executive-bi/ai';
import {
  createSubscriptionMonthRepository,
  createPostgresSubscriptionMonthRepository,
  type SubscriptionMonthRepository,
  type PostgresQueryClient,
} from '@executive-bi/analytics';
import type { KnowledgeDocument } from '@executive-bi/retrieval';
import {
  MrrDeclineInvestigationService,
  type InvestigationStore,
} from '@executive-bi/investigations';
import { TrustedMrrService } from '@executive-bi/metrics';
import { createCompanyKnowledgeSearch } from '@executive-bi/retrieval';
import { MrrDeclineApi } from './routes.js';
import type { AccessStore } from '../../access.js';
import {
  loadSyntheticMrrDeclineDependencies,
  type SyntheticMrrDeclineDependencies,
  loadSyntheticKnowledgeDocuments,
} from './synthetic-source.js';

export function createMrrDeclineApi(
  dependencies: SyntheticMrrDeclineDependencies,
  store?: InvestigationStore,
  operations?: OperationalRepository,
  model?: InvestigationModel,
  access?: AccessStore,
): MrrDeclineApi {
  return composeMrrDeclineApi(
    createSubscriptionMonthRepository(dependencies.snapshot),
    dependencies.documents,
    store,
    operations,
    model,
    access,
  );
}

function composeMrrDeclineApi(
  repository: SubscriptionMonthRepository,
  documents: readonly KnowledgeDocument[],
  store?: InvestigationStore,
  operations?: OperationalRepository,
  model?: InvestigationModel,
  access?: AccessStore,
): MrrDeclineApi {
  const metrics = new TrustedMrrService(repository);
  const knowledge = createCompanyKnowledgeSearch(documents);
  const investigation = new MrrDeclineInvestigationService(
    {
      getCustomerChurnRate: metrics.getCustomerChurnRate.bind(metrics),
      getCustomerCountryContributions:
        metrics.getCustomerCountryContributions.bind(metrics),
      compareCountryMrr: metrics.compareCountryMrr.bind(metrics),
      compareMrr: metrics.compareMrr.bind(metrics),
      getMrrMovement: metrics.getMrrMovement.bind(metrics),
      getCustomerMrrMovement: metrics.getCustomerMrrMovement.bind(metrics),
      breakdownMrr: metrics.breakdownMrr.bind(metrics),
      searchCompanyKnowledge: knowledge.search.bind(knowledge),
    },
    store,
    operations
      ? {
          repository: operations,
          ...(model ? { model } : {}),
          searchKnowledge: knowledge.search.bind(knowledge),
        }
      : undefined,
  );
  return new MrrDeclineApi(
    investigation,
    access,
    new Map(
      documents.map((document) => [document.documentId, document.access]),
    ),
  );
}

export async function createSyntheticMrrDeclineApi(
  store?: InvestigationStore,
): Promise<MrrDeclineApi> {
  return createMrrDeclineApi(
    await loadSyntheticMrrDeclineDependencies(),
    store,
    createOperationalRepository(
      JSON.parse(
        await readFile(
          new URL(
            '../../../../../data/synthetic/operations-2026.json',
            import.meta.url,
          ),
          'utf8',
        ),
      ),
    ),
    configuredModel(),
  );
}

export async function createPostgresMrrDeclineApi(
  client: PostgresQueryClient,
  store: InvestigationStore,
  access?: AccessStore,
): Promise<MrrDeclineApi> {
  return composeMrrDeclineApi(
    createPostgresSubscriptionMonthRepository(client),
    await loadSyntheticKnowledgeDocuments(),
    store,
    createPostgresOperationalRepository(client),
    configuredModel(),
    access,
  );
}

export function configuredModel(
  environment: Record<string, string | undefined> = process.env,
): InvestigationModel | undefined {
  const provider =
    environment.INVESTIGATION_MODEL_PROVIDER ??
    (environment.GEMINI_API_KEY ? 'gemini' : 'openai');
  if (provider === 'gemini')
    return environment.GEMINI_API_KEY
      ? createGeminiModel({
          apiKey: environment.GEMINI_API_KEY,
          model: environment.GEMINI_INVESTIGATION_MODEL ?? 'gemini-3.8-flash',
        })
      : undefined;
  if (provider !== 'openai')
    throw new Error('Unsupported investigation model provider.');
  const key = environment.OPENAI_API_KEY;
  const model = environment.OPENAI_INVESTIGATION_MODEL;
  return key && model ? createOpenAIModel({ apiKey: key, model }) : undefined;
}
