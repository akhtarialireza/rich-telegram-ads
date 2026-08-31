export type ApiResult = {
  error?: string;
  field?: string;
  redirect_to?: string;
  [key: string]: any;
};

export function request(method: string, params: any): Promise<ApiResult> {
  return new Promise((resolve) => {
    try {
      Aj.apiRequest(method, params, (result: ApiResult) => resolve(result || {}));
    } catch (err: any) {
      resolve({ error: String(err?.message || err) });
    }
  });
}
