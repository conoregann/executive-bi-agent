import { createSyntheticMrrDeclineApi } from './index.js';
import { createMrrDeclineServer } from './http-server.js';

const port = Number.parseInt(process.env.PORT ?? '3001', 10);
createMrrDeclineServer(await createSyntheticMrrDeclineApi()).listen(port);
