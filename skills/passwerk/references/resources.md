# Resources: which `passwerk://` URI answers which question

| Question | Resource |
|---|---|
| Which categories exist, what are the key dates, how many attributes are mandatory, what is the workflow order? | `passwerk://reference/cheatsheet` (Markdown, DE and EN) |
| What does attribute X mean, what are its synonyms, unit, range, legal references, who has the data? | `passwerk://reference/attributes` (all attributes) or the `explain_attribute` tool (one) |
| What does plausibility rule PW-PLAUS-nnn check and how is it fixed? | `passwerk://reference/rules` or `explain_attribute` with the rule id |
| How is IDTA 02035 part N structured (paths, idShorts, semanticIds, cardinalities)? | `passwerk://reference/template/{1..7}` |
| Which golden drafts exist to try the tools without documents? | `passwerk://samples`, then `passwerk://samples/{name}` (e.g. `ev-valid`, `lmt-missing-state-of-charge`) |
| What is in the bundle, fact set or draft a tool returned? | `passwerk://session/bundle/{id}`, `passwerk://session/facts/{id}`, `passwerk://session/draft/{id}` |

Parts: 1 Nameplate, 2 Handover Documentation, 3 Material Composition, 4 Technical Data,
5 Product Condition, 6 Carbon Footprint, 7 Circularity.

Prompts (`prompts/get`): `build-passport-interview` (arguments `category`, `lang`),
`audit-supplier-submission` (`lang`), `draft-data-request` (`lang`).
