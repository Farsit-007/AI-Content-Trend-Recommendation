"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
jest.mock('../app/lib/openrouterClient');
jest.mock('../app/config', () => ({
    __esModule: true,
    default: { embedding_model: 'test-embedding-model' },
}));
const openrouterClient_1 = require("../app/lib/openrouterClient");
const embeddings_1 = require("../app/lib/embeddings");
const mocked = openrouterClient_1.openrouter;
describe('embed', () => {
    afterEach(() => jest.clearAllMocks());
    it('returns the vector from a well-formed response', () => __awaiter(void 0, void 0, void 0, function* () {
        mocked.embeddings.create.mockResolvedValue({ data: [{ embedding: [0.1, 0.2] }] });
        yield expect((0, embeddings_1.embed)('hello')).resolves.toEqual([0.1, 0.2]);
    }));
    it('throws a clear error instead of a raw TypeError when the response has no data array', () => __awaiter(void 0, void 0, void 0, function* () {
        mocked.embeddings.create.mockResolvedValue({});
        yield expect((0, embeddings_1.embed)('hello')).rejects.toThrow('OpenRouter embedding response did not contain a vector');
    }));
    it('truncates oversized input before sending it to the API', () => __awaiter(void 0, void 0, void 0, function* () {
        mocked.embeddings.create.mockResolvedValue({ data: [{ embedding: [0.1] }] });
        yield (0, embeddings_1.embed)('x'.repeat(10000));
        const sentInput = mocked.embeddings.create.mock.calls[0][0].input;
        expect(sentInput.length).toBe(6000);
    }));
});
describe('embedBatch', () => {
    afterEach(() => jest.clearAllMocks());
    it('returns [] without calling the API for an empty input', () => __awaiter(void 0, void 0, void 0, function* () {
        const vectors = yield (0, embeddings_1.embedBatch)([]);
        expect(vectors).toEqual([]);
        expect(mocked.embeddings.create).not.toHaveBeenCalled();
    }));
    it('makes exactly one API call for multiple texts and returns vectors in order', () => __awaiter(void 0, void 0, void 0, function* () {
        mocked.embeddings.create.mockResolvedValue({
            data: [{ embedding: [1, 0] }, { embedding: [0, 1] }, { embedding: [1, 1] }],
        });
        const vectors = yield (0, embeddings_1.embedBatch)(['a', 'b', 'c']);
        expect(mocked.embeddings.create).toHaveBeenCalledTimes(1);
        expect(mocked.embeddings.create).toHaveBeenCalledWith(expect.objectContaining({ input: ['a', 'b', 'c'] }));
        expect(vectors).toEqual([[1, 0], [0, 1], [1, 1]]);
    }));
    it('throws when the response vector count does not match the input count', () => __awaiter(void 0, void 0, void 0, function* () {
        mocked.embeddings.create.mockResolvedValue({ data: [{ embedding: [1, 0] }] });
        yield expect((0, embeddings_1.embedBatch)(['a', 'b'])).rejects.toThrow('OpenRouter embedding response did not contain the expected vectors');
    }));
    it('throws when the response has no data array', () => __awaiter(void 0, void 0, void 0, function* () {
        mocked.embeddings.create.mockResolvedValue({});
        yield expect((0, embeddings_1.embedBatch)(['a'])).rejects.toThrow('OpenRouter embedding response did not contain the expected vectors');
    }));
    it('truncates each oversized text before sending them to the API', () => __awaiter(void 0, void 0, void 0, function* () {
        mocked.embeddings.create.mockResolvedValue({ data: [{ embedding: [0.1] }, { embedding: [0.2] }] });
        yield (0, embeddings_1.embedBatch)(['short', 'y'.repeat(10000)]);
        const sentInput = mocked.embeddings.create.mock.calls[0][0].input;
        expect(sentInput[0]).toBe('short');
        expect(sentInput[1].length).toBe(6000);
    }));
});
