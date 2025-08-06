import { ResourceSearchHandlerBase } from '../../src/insights/resource-search.js';
import { PulumiSearchApiClient } from '../../src/insights/pulumi-api-client.js';
import { MockPulumiApiClient } from './pulumi-api-client.js';

/**
 * Test implementation using mock client
 */
export class TestResourceSearchHandler extends ResourceSearchHandlerBase {
  createClient(): PulumiSearchApiClient {
    return new MockPulumiApiClient();
  }
}
