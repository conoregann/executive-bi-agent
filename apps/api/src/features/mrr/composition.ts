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
import {
  loadSyntheticMrrDeclineDependencies,
  type SyntheticMrrDeclineDependencies,
  loadSyntheticKnowledgeDocuments,
} from './synthetic-source.js';

export function createMrrDeclineApi(
  dependencies: SyntheticMrrDeclineDependencies,
  store?: InvestigationStore,
): MrrDeclineApi {
  return composeMrrDeclineApi(
    createSubscriptionMonthRepository(dependencies.snapshot),
    dependencies.documents,
    store,
  );
}

function composeMrrDeclineApi(
  repository: SubscriptionMonthRepository,
  documents: readonly KnowledgeDocument[],
  store?: InvestigationStore,
): MrrDeclineApi {
  const metrics = new TrustedMrrService(repository);
  const knowledge = createCompanyKnowledgeSearch(documents);
  const investigation = new MrrDeclineInvestigationService(
    {
      compareMrr: metrics.compareMrr.bind(metrics),
      getMrrMovement: metrics.getMrrMovement.bind(metrics),
      getCustomerMrrMovement: metrics.getCustomerMrrMovement.bind(metrics),
      breakdownMrr: metrics.breakdownMrr.bind(metrics),
      searchCompanyKnowledge: knowledge.search.bind(knowledge),
    },
    store,
  );
  return new MrrDeclineApi(investigation);
}

export async function createSyntheticMrrDeclineApi(
  store?: InvestigationStore,
): Promise<MrrDeclineApi> {
  return createMrrDeclineApi(
    await loadSyntheticMrrDeclineDependencies(),
    store,
  );
}

export async function createPostgresMrrDeclineApi(
  client: PostgresQueryClient,
  store: InvestigationStore,
): Promise<MrrDeclineApi> {
  return composeMrrDeclineApi(
    createPostgresSubscriptionMonthRepository(client),
    await loadSyntheticKnowledgeDocuments(),
    store,
  );
}
