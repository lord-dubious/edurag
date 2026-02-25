## 2025-05-21 - Prism Redesign: Luminous Intellect

**Learning:** High-contrast "Luminous" aesthetics (Deep Obsidian + Electric Indigo) require careful handling of glassmorphism to ensure readability.
**Action:** Used `oklch` values for precise color control and created a `.glass-panel` utility that uses a semi-transparent background with a subtle white border to separate layers from the deep background.

**Learning:** AI Streaming states need to be visceral.
**Action:** Implemented a pulsing cursor and "shimmering" borders for the active generation state.

**Design System Decisions:**
- **Typography**: Space Grotesk (Headings) + DM Sans (Body). Geometric yet human.
- **Primary Color**: Electric Indigo (`oklch(0.55 0.25 280)`). chosen for its digital-native vibrancy.
- **Components**:
    - **Floating Capsule Input**: Elevates the chat input from a standard form field to a "command center".
    - **Distinctive Bubbles**: User messages are solid/vibrant to indicate intent; AI messages are glass/translucent to indicate processing/neutrality.
    - **Glassmorphism**: Used extensively for the Sidebar and Cards to create depth without clutter.

**Constraints:**
- The `BrandProvider` logic overrides CSS variables. I updated the defaults to match the new theme, but real users might have custom colors. The design ensures the structure holds up even with different primary colors.
