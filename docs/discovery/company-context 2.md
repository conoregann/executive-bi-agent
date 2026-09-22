# Company context: Northstar Workspace

## Purpose

Northstar Workspace is the fictional company used in all seeds, documents, dashboards, and evaluations. This contract makes example data internally consistent; it is not a claim about a real company.

## Business model

Northstar Workspace sells collaborative workflow software to mid-market and enterprise customers in Europe and North America.

| Attribute          | Contract                                                                              |
| ------------------ | ------------------------------------------------------------------------------------- |
| Revenue model      | B2B SaaS subscriptions, billed monthly or annually                                    |
| Currency           | EUR is the reporting currency; source currencies are out of scope for the first slice |
| Plans              | Starter, Growth, Enterprise                                                           |
| Customer lifecycle | Prospect → customer → active / cancelled                                              |
| Reporting calendar | Gregorian calendar; reporting month ends at 23:59:59 UTC on its last day              |
| Analysis horizon   | Synthetic data starts in January 2025; evaluations state an explicit period           |

## Customer segmentation

| Dimension             | Allowed values                                                                                  | Use                          |
| --------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------- |
| `plan`                | `starter`, `growth`, `enterprise`                                                               | Subscription tier            |
| `company_size`        | `small`, `mid_market`, `enterprise`                                                             | Customer employee-band proxy |
| `industry`            | `technology`, `financial_services`, `professional_services`, `retail`, `manufacturing`, `other` | Business vertical            |
| `country`             | ISO 3166-1 alpha-2 country code                                                                 | Customer billing country     |
| `region`              | `uk_ireland`, `dach`, `nordics`, `north_america`, `rest_of_europe`                              | Derived reporting geography  |
| `acquisition_channel` | `sales_outbound`, `partner`, `paid_search`, `organic`, `product_led`                            | First-touch attribution      |

`company_size` is the customer’s segment, not a product-usage count. `region` is derived from `country` by a documented mapping; it must not be supplied independently by a connector.

## Source domains

| Domain    | System of record        | Core entities                        | First-slice role                |
| --------- | ----------------------- | ------------------------------------ | ------------------------------- |
| Billing   | billing platform        | subscriptions, invoices, payments    | Recurring-revenue facts         |
| CRM       | sales platform          | accounts, opportunities, owners      | Pipeline and loss context       |
| Product   | event store             | users, sessions, feature events      | Adoption and activation signals |
| Marketing | campaign platform       | campaigns, spend, leads, conversions | Acquisition context             |
| Support   | ticketing platform      | tickets, escalations, CSAT           | Account-health context          |
| Knowledge | internal document store | reports, meeting notes, incidents    | Explanatory evidence            |

An entity ID from a source system is never assumed to equal an ID from another source. Cross-domain joins require a documented canonical customer mapping.

## Canonical entities and grains

| Entity             | Canonical grain                             | Stable identifier          |
| ------------------ | ------------------------------------------- | -------------------------- |
| Customer           | One row per customer account                | `customer_id`              |
| Subscription       | One row per subscription lifecycle          | `subscription_id`          |
| Subscription-month | One row per subscription and calendar month | `subscription_id`, `month` |
| Product event      | One row per recorded event                  | `event_id`                 |
| Opportunity        | One row per sales opportunity               | `opportunity_id`           |
| Campaign-day       | One row per campaign and calendar day       | `campaign_id`, `date`      |
| Support ticket     | One row per ticket                          | `ticket_id`                |
| Knowledge document | One row per source document                 | `document_id`              |
| Knowledge chunk    | One row per retrievable document segment    | `chunk_id`                 |

## Initial executive questions

The first capabilities should answer these questions from evidence, not a fabricated story:

1. What happened to MRR in a stated month versus the previous month?
2. Which plan, region, or customer segment drove the change?
3. Which customers account for the largest churned MRR?
4. What support, CRM, or incident evidence is relevant to those customers or dates?
5. Is the company on track against a stated MRR target?

## Non-goals for the semantic-foundation slice

- Real customer data, credentials, or external integrations.
- Multi-currency accounting and revenue-recognition schedules.
- Forecasting, account-risk scoring, or causal inference.
- Self-serve semantic-model editing.
- Autonomous external actions such as contacting customers or changing CRM records.

## Naming rules

- Use `MRR`, not “monthly revenue,” for recurring subscription revenue.
- Use `customer`, not “account,” unless referring to a CRM account record.
- Use `cancelled`, not “churned,” for a subscription status; churn is a calculated event or metric.
- Include a time period whenever a metric is stated.
- Mark every example and dataset as synthetic.
