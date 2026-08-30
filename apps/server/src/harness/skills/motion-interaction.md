---
name: motion-interaction
triggers: ["motion", "animation", "transition", "spring", "gesture", "feedback"]
companions: ["ui-ux-mastery"]
---

# Motion & Interaction Skill Pack

## Motion System
1. **Spring Physics**: Use natural physics over linear tweens (`stiffness: 400`, `damping: 30`).
2. **Speed**: Micro-interactions finish in `<180ms`; modal transitions finish in `<240ms`.
3. **Gesture Choreography**: Swipe-to-dismiss, pull-to-refresh, and drag interactions follow finger 1:1 with elastic resistance.
4. **Reduced Motion**: Always respect `prefers-reduced-motion` or platform accessibility toggles by instantly switching to instant state changes or subtle opacity fades.
