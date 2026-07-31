# DeepL Document Translation Validation

Verified: 2026-07-31

## Verdict

The existing DeepL key is active and can use Document Translation. Validation first used the official `deepl-node` client, then the production native HTTP client was verified independently. Real TXT translations completed successfully and all local temporary files were deleted afterward.

The account currently reports a 1,000,000-character monthly limit, despite DeepL's general API Free documentation advertising 500,000 characters. Runtime usage checks must remain the source of truth because account-specific limits can differ.

The current key is still identified as DeepL API Free. This is suitable for non-sensitive documents, but it must not be presented as confidential personal-document processing. DeepL states that API Free is insufficient for processing personal data, while the stronger no-training/immediate-deletion assurances apply to paid API plans.

## Live account validation

- Key type: DeepL API Free (`:fx` endpoint selection), value never logged.
- Official Node client available: `deepl-node` 1.27.0.
- `translateDocument()` available: yes.
- Document test: English TXT to Indonesian.
- Result: `done`.
- Billed characters: 105.
- Usage after the first test: 1,171 / 1,000,000 characters.
- Production-client test: 29 additional billed characters.
- Remaining after both validation tests: 998,800 characters.
- Target languages returned by account: 110.
- Indonesian and English (US) targets: available.
- Temporary input/output directory removed in `finally`: verified.

## Formats and documented API Free limits

| Initial Hengs format | DeepL API Free upload limit | Character limit |
|---|---:|---:|
| DOCX | 10 MB | 500,000 |
| PPTX | 10 MB | 500,000 |
| PDF | 10 MB | 500,000 |
| HTML | 5 MB | 500,000 |
| TXT | 1 MB | 500,000 |

DeepL also supports DOC, XLSX, XLIFF, SRT, and beta image translation, but they are outside Hengs v1.2.0.

## Quota behavior

- DOCX, PPTX, and PDF are billed at a minimum of 50,000 characters per translated file, even when the document is much smaller.
- HTML and TXT are billed by actual source character count without the 50,000-character minimum.
- With the account's current 1,000,000-character limit, twenty tiny DOCX/PPTX/PDF jobs could consume the entire monthly allowance.
- The bot must query usage before accepting expensive document formats and show the estimated minimum charge in its confirmation/progress response.

## Privacy decision required

Discord access can be private through an allowlist, and Hengs can avoid permanent local storage and logs. The document still leaves the machine and is processed by DeepL.

For DeepL API Free, Hengs should accept only documents explicitly confirmed as non-sensitive and must display a vendor-processing warning. Documents containing personal, employment, financial, medical, credential, contract, or other confidential data should remain blocked until the account uses a paid DeepL API plan with the appropriate data-protection terms.

## Implementation consequences

1. Keep `TRANSLATE_ALLOWED_USER_IDS` as a strict runtime allowlist.
2. Require an explicit non-sensitive confirmation before upload while using API Free.
3. Query DeepL usage before each job and reject when the remaining quota cannot cover the format's minimum charge.
4. Use one document worker initially; queue additional jobs to avoid DeepL 429 responses.
5. Download the Discord attachment to a unique temporary directory, translate, upload the result, and delete both files in `finally`.
6. Never log filenames, document contents, attachment URLs, or DeepL document handles.
7. PDF OCR and scanned-document guarantees remain out of scope.

## Production client decision

The Discord implementation uses DeepL's documented REST endpoints through Node 24 native `fetch`, not `deepl-node`. The official SDK version validated successfully, but it transitively installed `adm-zip`, which had a high-severity crafted-ZIP memory-allocation advisory. Since Hengs accepts untrusted DOCX/PPTX attachments and does not need SDK document minification, removing that dependency gives a smaller and safer runtime surface. The final dependency audit reports zero vulnerabilities.

## Official sources

- DeepL usage and format limits: https://developers.deepl.com/docs/resources/usage-limits
- DeepL document upload formats: https://developers.deepl.com/api-reference/document/upload-and-translate-a-document
- DeepL document translation guidance: https://developers.deepl.com/docs/best-practices/document-translations
- DeepL API usage accounting: https://support.deepl.com/hc/en-us/articles/360020685720-Usage-count-and-billing-in-DeepL-API
- DeepL privacy policy: https://www.deepl.com/en/privacy
- DeepL personal-data requirement: https://support.deepl.com/hc/en-us/articles/8644041855516-DeepL-API-custom-connector-for-Microsoft-Power-Automate
