import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('Cat Toxin API', () => {
	it('GET / returns status ok (unit style)', async () => {
		const request = new IncomingRequest('http://example.com/');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		const body = await response.json() as { status: string; version: string };
		expect(body.status).toBe('ok');
		expect(body.version).toBe('1.0.0');
	});

	it('GET / returns status ok (integration style)', async () => {
		const response = await SELF.fetch('https://example.com/');
		expect(response.status).toBe(200);
		const body = await response.json() as { status: string };
		expect(body.status).toBe('ok');
	});
});
