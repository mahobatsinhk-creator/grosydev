import { startServer } from './index.js';
import { processOrder } from './fulfill.js';
import { processAllUnfulfilled } from './batch.js';
import { getShippingJwt, checkPincodeServiceability } from './bluedart.js';
import { assertBlueDartAuthConfig } from './config.js';

const [command, arg] = process.argv.slice(2);

async function main() {
  if (command === 'test-auth') {
    assertBlueDartAuthConfig();
    const jwt = await getShippingJwt(true);
    console.log('Blue Dart auth OK. JWT length:', jwt.length);

    const pin = await checkPincodeServiceability('385001');
    const r = pin?.GetServicesforPincodeResult ?? pin;
    console.log('Pickup pincode 385001:', r?.CityDescription, r?.AreaCode, r?.ErrorMessage);
    return;
  }

  if (command === 'serve' || !command) {
    startServer();
    return;
  }

  if (command === 'fulfill' && arg) {
    const result = await processOrder(arg);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'dry-run' && arg) {
    const result = await processOrder(arg, { dryRun: true });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'fulfill-all') {
    const result = await processAllUnfulfilled({ limit: Number(arg || 25) });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Usage:
  node src/cli.js serve
  node src/cli.js test-auth
  node src/cli.js fulfill <order-name-or-id>
  node src/cli.js fulfill-all [limit]
  node src/cli.js dry-run <order-name-or-id>`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
