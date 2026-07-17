export interface IAITransport {
  call(type: 'GENERATE' | 'LIST_MODELS' | 'RESET_SESSION', settings: any, params?: any): Promise<any>;
}
