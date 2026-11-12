# EU Public Tenders Feed (TED): new tenders by CPV code and country

Get new **EU public procurement tenders** from **TED (Tenders Electronic Daily)**, the official EU journal for
public contracts, filtered by **CPV code, buyer country and keyword**. Each row has the title, buyer, deadline,
CPV codes, procedure type and a link to the notice. Run it daily in **new-only mode** and you get just the tenders
you have not seen before: a tender alert for Slack, email, Google Sheets or your CRM.

Data comes from the official TED Search API (open data published by the EU Publications Office). No login, no
scraping of web pages, no personal data.

## Who it's for
- **Companies that bid on public contracts**: IT services, construction, consulting, facility services, medical supplies.
- **Bid managers and tender consultants** who watch several sectors or countries for clients.
- **Market researchers** who want a CSV of who is buying what, where.

## What you get (sample row)
```json
{
  "noticeId": "768285-2026",
  "title": "Beschaffung eines zentralen Social-Media Content Management Tools (SMCMT) für die Polizei NRW",
  "noticeTitle": "Germany – Software-related services – Beschaffung eines zentralen Social-Media ...",
  "publicationDate": "2026-11-05",
  "deadline": "2026-12-07",
  "buyerName": "Landesamt für Zentrale Polizeiliche Dienste Nordrhein-Westfalen",
  "buyerCountry": "DEU",
  "cpvCodes": ["72260000", "72267000", "72268000"],
  "contractNature": "services",
  "procedureType": "open",
  "noticeType": "cn-standard",
  "formType": "competition",
  "placeOfPerformance": ["DEA12"],
  "estimatedValue": null,
  "currency": null,
  "url": "https://ted.europa.eu/en/notice/-/detail/768285-2026",
  "pdfUrl": "https://ted.europa.eu/en/notice/768285-2026/pdf"
}
```
Titles and buyer names come in your preferred language when TED has a translation (`language`, default `eng`),
otherwise in the original language. `estimatedValue` is filled only when the buyer published one.

## Input
| Field | Example | Notes |
|---|---|---|
| `cpvCodes` | `["72000000","48000000"]` | Parent codes include all children. 72 = IT services, 48 = software, 45 = construction, 79 = business services, 33 = medical equipment, 90 = cleaning/environmental. Empty = all sectors. |
| `countries` | `["IRL","NLD"]` | ISO alpha-3 code of the buyer's country. Empty = all EU/EEA. |
| `keywords` | `cybersecurity` | All words must appear in the notice. |
| `noticeKind` | `competition` | `competition` = open calls you can bid on, `result` = contract awards, `planning` = prior information notices, `all`. |
| `daysBack` | `7` | Publication-date window (1-90). |
| `maxResults` | `100` | Cap per run. |
| `mode` | `newOnly` | `all` or `newOnly` (only notices not seen in earlier runs with the same `stateKey`). |
| `stateKey` | `it-ireland` | One key per saved search. |

Example inputs:
- IT tenders in Ireland and the Netherlands this week: `{"cpvCodes":["72000000"],"countries":["IRL","NLD"]}`
- Daily construction alerts in Poland: `{"cpvCodes":["45000000"],"countries":["POL"],"mode":"newOnly","stateKey":"pl-construction","daysBack":3}`
- Who won cybersecurity contracts in Germany and Austria last month: `{"keywords":"cybersecurity","countries":["DEU","AUT"],"noticeKind":"result","daysBack":30}`

With empty input the Actor returns the 100 newest open tenders across all countries.

## Daily tender alerts
1. Save a task with your CPV codes, countries, `mode: newOnly` and a `stateKey`.
2. Schedule it daily (TED publishes Monday to Friday).
3. Connect the dataset to Slack, email, Google Sheets or Zapier/Make with Apify integrations.

## Call it from code
```python
from apify_client import ApifyClient
client = ApifyClient("<APIFY_TOKEN>")
run = client.actor("datakit/ted-tenders-feed").call(run_input={
    "cpvCodes": ["72000000"], "countries": ["IRL"], "mode": "newOnly", "stateKey": "it-ie"})
for t in client.dataset(run["defaultDatasetId"]).iterate_items():
    print(t["deadline"], t["buyerName"], t["title"], t["url"])
```

## FAQ
**Is this legal to use?** TED content is official EU open data; the Publications Office allows reuse. This Actor
uses their public search API.

**Which countries are covered?** All notices published in TED: EU member states plus EEA and other countries that
publish there (above-threshold contracts). Small national-only tenders below EU thresholds are not in TED.

**How fresh is it?** TED publishes about 2,000 new notices each working day; the API returns them on publication.

**Does it include the full tender documents?** It gives the notice and PDF link; tender documents are on the
buyer's procurement portal linked from the notice.

Store page: https://apify.com/datakit/ted-tenders-feed · Tool page: https://datakit457.github.io/tools/eu-tenders-ted-api/

Built by datakit (I wrote this Actor).
