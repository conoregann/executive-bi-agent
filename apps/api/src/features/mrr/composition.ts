import { createSubscriptionMonthRepository } from '@executive-bi/analytics';
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
} from './synthetic-source.js';

export function createMrrDeclineApi(
  dependencies: SyntheticMrrDeclineDependencies,
  store?: InvestigationStore,
): MrrDeclineApi {
  const metrics = new TrustedMrrService(
    createSubscriptionMonthRepository(dependencies.snapshot),
  );
  const knowledge = createCompanyKnowledgeSearch(dependencies.documents);
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
