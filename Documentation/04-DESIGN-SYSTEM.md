# MIRROR Design System

## Interface Direction and Component Standards

## 1. Design intent

MIRROR should feel like a professional investigation workstation:
precise, restrained, analytical and trustworthy. It should not resemble
a generic AI SaaS template.

Visual references may include modern observability consoles, scientific
instruments and digital forensic tools. Do not copy an existing product.

## 2. Brand

Name: MIRROR\
Descriptor: The Differential Testing Laboratory for the Internet.

Brand attributes: - Technical - Precise - Calm - Analytical -
Evidence-led - Confident

## 3. Colour tokens

``` css
:root {
  --background: #090B10;
  --surface: #10141D;
  --surface-raised: #171D28;
  --surface-hover: #202938;
  --border: #252D3A;
  --border-strong: #344052;
  --text-primary: #F1F4F8;
  --text-secondary: #9AA6B7;
  --text-muted: #697588;
  --accent: #A78BFA;
  --accent-hover: #B9A4FF;
  --success: #36C98F;
  --warning: #F2B95D;
  --danger: #F06B78;
  --info: #65B9ED;
}
```

Use semantic tokens. Do not hardcode arbitrary colours throughout
components. Maintain contrast and do not rely on colour alone to
communicate status.

## 4. Typography

Use Geist or Inter with a consistent type scale.

Use monospaced text for: - IDs - URLs where appropriate - timestamps -
hashes - technical metadata - network status codes

Maintain legible body text and compact but readable data labels.

## 5. Layout

-   Desktop-first, responsive.
-   Restrained left navigation.
-   Main workspace with clear content hierarchy.
-   Optional contextual inspector panel.
-   Consistent spacing scale.
-   Dense tables only where they remain readable.
-   Avoid excessive rounded cards.
-   Avoid decorative gradients and glassmorphism.
-   Avoid oversized empty dashboard cards.

## 6. Components

Build reusable components: - AppShell - Sidebar - Topbar - PageHeader -
StatusBadge - Metric - DataTable - EmptyState - ErrorState -
LoadingState - ConfirmDialog - SessionCard - BrowserViewport -
ComparisonPanel - DifferenceHighlight - FindingRow - EvidenceViewer -
Timeline - CodeOrJsonViewer - ReportExportMenu

All interactive controls must be functional and accessible.

## 7. Primary screens

### Overview

Real persisted metrics, recent investigations, active runs, execution
health and a prominent create action.

### Investigation list

Search, filter, sort, paginate. Show title, target, status, last run and
finding count.

### Create investigation

A guided workflow: 1. Target URL 2. Authorization scope 3. Browser
sessions 4. Journey 5. Review and execute

### Experiment workspace

Live progress, session states, journey timeline and observation stream.

### Browser comparison

Side-by-side viewports with session configuration, screenshot comparison
and key findings. On narrow screens, stack panels or allow controlled
horizontal scrolling.

### Findings

Filter by category, severity and confidence. Clearly distinguish
confirmed observations from hypotheses.

### Finding inspector

Show baseline and comparison values, evidence, screenshots, DOM and
network observations, replay steps and optional AI interpretation.

### Evidence library

Show artifact type, timestamp, session, hash, related finding and
authorized download action.

### Reports

Generate, view and download JSON/PDF reports.

### Settings

Profile, appearance, browser defaults, execution limits, AI provider,
retention and security.

## 8. Interaction states

Every data-driven view must handle: - Initial loading - Refreshing -
Empty state - Validation error - API error - Partial result - Success -
Permission denied - Offline or reconnecting

Never leave inert buttons or decorative controls that appear
operational.

## 9. Motion

Use subtle motion only for: - State transitions - Job progress - Panel
expansion - Loading feedback - Finding focus

Respect reduced-motion preferences.

## 10. Accessibility

-   Semantic HTML
-   Keyboard navigation
-   Visible focus states
-   Labels for inputs
-   Accessible dialog behaviour
-   Sufficient contrast
-   Screen-reader status updates for execution state
