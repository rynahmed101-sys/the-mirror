import { OllamaProvider } from "./ollama";

/** Explicit local provider identity over the existing Ollama inference adapter. */
export class LocalProvider extends OllamaProvider {
  readonly isLocal = true;

  constructor(
    url = process.env.LOCAL_INFERENCE_URL || process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    model = process.env.LOCAL_MODEL || process.env.OLLAMA_DEFAULT_MODEL || "llama3.2",
  ) {
    super(
      url,
      model,
      process.env.LOCAL_API_KEY || process.env.OLLAMA_API_KEY,
      "local",
    );
  }
}
