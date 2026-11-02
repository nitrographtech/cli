# Nitrograph through OKX OnchainOS

Use this workflow only for a user task involving Nitrograph services through
OKX.AI or an explicitly selected OKX-compatible Nitrograph endpoint.

The intended endpoint is `https://api.nitrograph.com/integrations/okx/mcp`.
Availability is determined by the endpoint, not by this document. A disabled
endpoint or a passing compatibility check is not evidence of a live listing.

1. Discover the endpoint's tools with OnchainOS. Read each tool's schema and
   its exact deliverable before selecting it.
2. Request a quote for that tool and the actual input. Only a real x402
   challenge supplies the price; do not infer it from documentation or a
   Nitrograph catalog price. Initialization and tool discovery are free.
3. Show the amount, token, network, recipient, and requested service. Follow
   the installed OnchainOS payment workflow and the user's spending authority.
   Let OnchainOS handle wallet authentication and signing. Do not request
   private keys or send a Nitrograph API key to this endpoint.
4. Submit the authorized payment using OnchainOS's payment ID. Preserve the
   same tool parameters. A completed result includes validation information,
   an execution receipt ID, and the buyer's signed payment receipt.
5. Pending, timeout, or unknown settlement is not a successful purchase and
   is not permission to pay again. Retry the same request and payment proof.
   If the endpoint says review is needed, retain the payment ID for support.
6. Check missing fields and coverage. Schema validation does not prove that
   every factual claim is true, or that a requested email address exists.

Example workflow: use Nitrograph's bounded web search to find project/company
sources, then use OKX's market tools for separately identified onchain assets.
Keep source URLs, contract addresses, and missing information explicit. Do
not infer a token/company relationship from a matching name alone.

For a no-payment compatibility check:

```sh
nitrograph integrations okx check --json
```

References: [A2MCP integration](https://web3.okx.com/onchainos/dev-docs/okxai/howtomcp),
[OnchainOS skills](https://github.com/okx/onchainos-skills).
