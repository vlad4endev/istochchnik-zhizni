/** Default Cloud project (Frankfurt). Override via VITE_APPWRITE_* if needed. */
const DEFAULT_PROJECT_ID = '69fbc3640000a911aa79';
const DEFAULT_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';

class AppwriteClient {
  private projectId = '';
  private endpoint = '';

  setProject(projectId: string): this {
    this.projectId = projectId.trim();
    return this;
  }

  setEndpoint(endpoint: string): this {
    this.endpoint = endpoint.trim().replace(/\/$/, '');
    return this;
  }

  isConfigured(): boolean {
    return Boolean(this.projectId && this.endpoint);
  }

  ping(): Promise<Response> {
    if (!this.isConfigured()) {
      return Promise.reject(new Error('Appwrite is not configured'));
    }

    return fetch(`${this.endpoint}/ping`, {
      method: 'GET',
      headers: {
        'X-Appwrite-Project': this.projectId,
      },
    });
  }
}

const projectId =
  String(import.meta.env.VITE_APPWRITE_PROJECT_ID ?? '').trim() ||
  DEFAULT_PROJECT_ID;
const endpoint =
  String(import.meta.env.VITE_APPWRITE_ENDPOINT ?? '').trim() ||
  DEFAULT_ENDPOINT;

export const client = new AppwriteClient()
  .setProject(projectId)
  .setEndpoint(endpoint);
