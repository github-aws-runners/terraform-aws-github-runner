import { logger } from '@terraform-aws-github-runner/aws-powertools-util';

import { amiCleanup } from './ami';

export function run(): void {
  amiCleanup({
    minimumDaysOld: 30,
    maxItems: 100,
    amiFilters: [
      {
        Name: 'state',
        Values: ['available'],
      },
      {
        Name: 'image-type',
        Values: ['machine'],
      },
      {
        Name: 'tag:Packer',
        Values: ['true'],
      },
    ],
  })
    .then()
    .catch((e) => {
      logger.error(e);
    });
}

run();
