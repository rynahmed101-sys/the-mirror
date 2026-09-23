THE MIRROR application architecture

The primary human surface is the GPT-like research workspace at /.

Layers:
1. Inference: one Ollama adapter supporting local Ollama and hosted Ollama.
2. Agent execution: the existing tool executor, authorization checks, append-only ledger, observations, predictions, experiments, and provenance.
3. Laboratory plugins: src/lib/lab/plugins.ts. Plugins are first-class bounded research instruments. They can be selected individually or run as a suite. The declared sequence is observe -> retrieve_knowledge -> think -> visualize -> challenge -> act -> record -> evaluate.
4. Knowledge fabric: Mirror evidence, Hugging Face models/datasets/papers, public GitHub repositories, and allowlisted public URLs.
5. Machine interface: expirable, revocable access-link capabilities under /api/agent/access/:id. GET only describes the capability; state-changing actions use POST.
6. Brain-96 schema: src/lib/lab/brain96.ts is deliberately a topology seam. It is separate from the existing 6x16 perturbation fixture. No node meanings or left/right assignments are invented until the authoritative brain definition is available.

Secrets
The Ollama key can be overridden by an administrator at runtime through /api/mirror/runtime-config. The runtime override is AES-256-GCM encrypted and server-side. The browser receives only a masked preview.

Attachments
Attachments are stored in the private Supabase mirror-attachments bucket with SHA-256 metadata in mirror_attachments. The current v1 ingestion path stores the file and immutable metadata; richer extraction can be added per MIME type without changing the chat contract.

Compatibility
The previous forensic dashboard remains available at /control. The old bearer-token endpoint is retained for compatibility with already-issued credentials, while new external access is intended to use link capabilities.
