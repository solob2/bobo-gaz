import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  vendorId: z.string().min(1),
  bottleSize: z.string().min(1).max(20),
  quantity: z.number().int().min(1).max(20),
  customerName: z.string().trim().max(80).optional(),
  customerAddress: z.string().trim().max(200).optional(),
  rawInstructions: z.string().trim().min(3).max(500),
});

const INSTRUCTIONS = `Tu aides des clients de Bobo-Dioulasso (Burkina Faso) à envoyer leurs consignes de livraison de gaz butane à un vendeur.
Reformule les consignes du client en un message court, poli et clair en français simple, adressé au vendeur.
Règles : maximum 5 phrases ; n'invente aucune information absente (heure, adresse, téléphone) ; conserve tous les détails utiles (repères, horaires, consigne de bouteille vide, paiement, accès) ; pas de salutation finale signée, pas de guillemets, pas de markdown. Réponds uniquement avec le message.`;

export const rewriteDeliveryInstructions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Service de reformulation non configuré.");

    const { loadVendor } = await import("@/lib/vendors.server");
    const vendor = await loadVendor(data.vendorId);
    if (!vendor) throw new Error("Vendeur introuvable.");

    const { createOpenAI } = await import("@ai-sdk/openai");
    const { streamText } = await import("ai");
    const { createLovableAiGatewayRunIdFetch } = await import("@/lib/ai/run-id.server");

    const runIdFetch = createLovableAiGatewayRunIdFetch();
    const provider = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      fetch: runIdFetch.fetch,
    });

    const prompt = `Détails de la commande :
- Vendeur : ${vendor.name} (${vendor.quartier})
- Bouteille : ${data.bottleSize} × ${data.quantity}
- Client : ${data.customerName || "non précisé"}
- Adresse : ${data.customerAddress || "non précisée"}

Consignes du client (texte libre) :
${data.rawInstructions}`;

    try {
      const result = streamText({
        model: provider.responses("openai/gpt-6-astra"),
        instructions: INSTRUCTIONS,
        messages: [{ role: "user", content: prompt }],
        providerOptions: {
          openai: {
            forceReasoning: true,
            reasoningEffort: "low",
            reasoningSummary: "auto",
            store: false,
            include: ["reasoning.encrypted_content"],
          },
        },
      });
      const text = (await result.text).trim();
      if (!text) throw new Error("empty");
      return { message: text.slice(0, 800) };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      console.error("rewriteDeliveryInstructions failed", status, err);
      if (status === 429) throw new Error("Trop de demandes, réessayez dans un instant.");
      if (status === 402) throw new Error("Crédits IA épuisés. Contactez l'administrateur.");
      throw new Error("La reformulation a échoué. Vous pouvez garder votre texte tel quel.");
    }
  });
