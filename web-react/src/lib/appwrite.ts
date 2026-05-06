class AppwriteClient {
  private projectId = '';
  private endpoint = '';

  setProject(projectId: string): this {
    this.projectId = projectId;
    return this;
  }

  setEndpoint(endpoint: string): this {
    this.endpoint = endpoint.replace(/\/$/, '');
    return this;
  }

  ping(): Promise<Response> {
    return fetch(`${this.endpoint}/ping`, {
      method: 'GET',
      headers: {
        'X-Appwrite-Project': this.projectId,
      },
    });
  }
}

export const client = new AppwriteClient()
  .setProject('69fbc3640000a911aa79')
  .setEndpoint('https://fra.cloud.appwrite.io/v1');
