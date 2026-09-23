import { FoodSearchOffService, OFF_REQUEST_TIMEOUT_MS } from './food-search.off.service';

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('FoodSearchOffService.fetchProductByBarcode', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses AbortSignal.timeout with the exported timeout constant', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { status: 1, product: {} }));
    const service = new FoodSearchOffService();

    await service.fetchProductByBarcode('4008400123456');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('4008400123456');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(OFF_REQUEST_TIMEOUT_MS).toBe(8_000);
  });

  it('returns "found" with the raw product on a successful response with status 1', async () => {
    const product = { product_name: 'Müsli', nutriments: { proteins_100g: 8 } };
    fetchMock.mockResolvedValue(jsonResponse(200, { status: 1, product }));
    const service = new FoodSearchOffService();

    const result = await service.fetchProductByBarcode('123');

    expect(result).toEqual({ status: 'found', product });
  });

  it('returns "not-found" on HTTP 404', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, {}));
    const service = new FoodSearchOffService();

    const result = await service.fetchProductByBarcode('123');

    expect(result).toEqual({ status: 'not-found' });
  });

  it('returns "not-found" when OFF reports status !== 1 (no product for this barcode)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { status: 0 }));
    const service = new FoodSearchOffService();

    const result = await service.fetchProductByBarcode('123');

    expect(result).toEqual({ status: 'not-found' });
  });

  it('returns "error" distinct from "not-found" on a network/timeout failure', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation was aborted.', 'TimeoutError'));
    const service = new FoodSearchOffService();

    const result = await service.fetchProductByBarcode('123');

    expect(result.status).toBe('error');
    expect(result).not.toEqual({ status: 'not-found' });
  });

  it('returns "error" on a non-404 non-ok HTTP status', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, {}));
    const service = new FoodSearchOffService();

    const result = await service.fetchProductByBarcode('123');

    expect(result.status).toBe('error');
  });
});
