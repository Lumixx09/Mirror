# MIRROR Steering: Design System & UI Principles

## Aesthetic & Tone
Professional forensic workstation: precise, restrained, analytical, dark mode, high contrast. No cartoonish gradients or generic AI SaaS tropes.

## Color Tokens
- Background: `#090B10`
- Surface: `#10141D`
- Surface Raised: `#171D28`
- Surface Hover: `#202938`
- Border: `#252D3A`
- Border Strong: `#344052`
- Text Primary: `#F1F4F8`
- Text Secondary: `#9AA6B7`
- Text Muted: `#697588`
- Accent: `#A78BFA` (violet)
- Accent Hover: `#B9A4FF`
- Success: `#36C98F`
- Warning: `#F2B95D`
- Danger: `#F06B78`
- Info: `#65B9ED`

## Typography & Monospace
Use Geist/Inter for interface text.
Always use monospace font for UUIDs, URLs, timestamps, hashes, HTTP status codes, and code/JSON inspection panels.

## Accessibility
Every interactive element must feature keyboard focus outlines, accessible names, and ARIA labels. Real states (loading, empty, error, partial, success) are required everywhere.
