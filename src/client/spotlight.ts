/**
 * Cursor spotlight glow + geometric tilt: the deepseek.com/harness
 * feature-card hover interactions, ported onto the floating glass panes.
 *
 * Two effects ride the same hover marker (`data-spot-on`):
 * - a blue radial glow that follows the cursor — a `data-dsh-aqua-glow`
 *   overlay inside each pane whose inline background a JS pointermove
 *   writes (`radial-gradient(180px at Xpx Ypx, rgba(120,170,255,.15),
 *   transparent 70%)`, official values). The glow sits BEHIND the glass
 *   (z-index -1) so it diffuses through the translucent surface and never
 *   covers content;
 * - a cursor-driven rigid tilt written inline per pointermove, the official
 *   card's exact recipe (sign-verified from its inline transform):
 *   `perspective(800px) rotateX(θx) rotateY(θy) scale(1.01)` with
 *   θx = −k·Δy, θy = +k·Δx — the edge under the cursor sinks, the far edge
 *   lifts (cursor right ⇒ right sinks; cursor top ⇒ top sinks), ≈1° at the
 *   pane edge, 0.1s ease-out transition;
 *
 * Port notes:
 * - the sidebar NEVER tilts (its settings overlay renders inside the column
 *   and a running transform would re-anchor it — the panel traps at the
 *   column width); it keeps the glow;
 * - spots NEST (the sidebar column contains the raised new-session button,
 *   both stamped): a hover session on the inner pane paints the glow CHAIN —
 *   every ancestor spot's radial follows the cursor too, so the light stays
 *   continuous across the nested glass instead of freezing on the outer
 *   pane;
 * - the composer bar (inputbar) DOES tilt. Tooltips that mount inside it
 *   (send/stop, context, stats — the app's viewport-anchored Fd bubbles) are
 *   re-pinned to their trigger every frame by the bubble-anchor loop, so the
 *   tilt stays live while they show and the hover text never lands in the
 *   bar's poisoned coordinate space; dialogs/menus/listboxes cannot be
 *   re-pinned that way (they clamp by measuring their rendered box), so
 *   those alone pause the tilt via the keeper's glide-back and are revealed
 *   once the transform is home;
 * - the tilt rides a short CSS transition and reduced motion skips it;
 * - geometry is measured ONCE per hover session in untransformed local space
 *   (offset-based — immune to the pane's own rotation) and refreshed on
 *   DOM/layout changes, so the per-frame path does zero layout reads.
 *
 * Two html-attribute gates from the layer's settings: `data-dsh-aqua-spotlight`
 * (glow) and `data-dsh-aqua-press` (tilt). Hover tracking runs when EITHER is
 * on. The glow divs are maintained by spot-core's overlay keeper, independent
 * of the toggles.
 */
import { repinPanelBubbles } from './bubble-anchor.ts'
import {
  ancestorSpots, closestSpot, ensureGlow, glassLocalRect, GLOW_ATTR, inside, ON_ATTR, spotElements,
  startOverlayKeeper, visualRect,
} from './spot-core.ts'

/** html attribute the layer uses to switch the glow effect (its toggle). */
export const SPOTLIGHT_ATTRIBUTE = 'data-dsh-aqua-spotlight'

/** html attribute the layer uses to switch the tilt effect (its toggle). */
export const PRESS_ATTRIBUTE = 'data-dsh-aqua-press'

/** Glow radius, px — matches the official card. */
const GLOW_RADIUS = 180

/** Fallback glow color (the CSS var is normally provided by the stylesheet). */
const GLOW_FALLBACK = 'rgba(90, 215, 255, 0.17)'

/** Tilt magnitude at the pane edge, radians (≈1° — perceptible but gentle). */
const TILT_MAX = 0.0175

/** Panes whose min dimension exceeds this (px) tilt at half magnitude —
 *  large boards (the trajectory timeline, a full-page plugin view) would
 *  otherwise read as violently pressed at the edges. */
const TILT_GENTLE_MIN = 480

/** Tilt perspective distance, px (official value). */
const TILT_PERSPECTIVE = 800

/** Ease-back settle time (ms) — must outlast the CSS transform transition. */
const SETTLE_MS = 240

/** The glow is live only while its gate attribute is on <html>. */
function glowGated(): boolean {
  return document.documentElement.hasAttribute(SPOTLIGHT_ATTRIBUTE)
}

/** The tilt is live only while its gate attribute is on <html>. */
function tiltGated(): boolean {
  return document.documentElement.hasAttribute(PRESS_ATTRIBUTE)
}

/** Hover tracking runs when EITHER effect is enabled. */
function hoverGated(): boolean {
  return glowGated() || tiltGated()
}

/** Whether the tilt may run on this pane right now. */
function tiltable(spot: HTMLElement): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  // The settings overlay renders INSIDE the sidebar column: tilting the
  // sidebar while the panel is open would re-anchor its fixed overlay into
  // the column — so the sidebar pauses while a dialog exists (the keeper
  // untraps it instantly the moment the panel mounts).
  if (spot.matches('[class*="sidebarCol"]') && document.querySelector('[role="dialog"]') !== null) return false
  // A VISIBLE popover mounted inside the inputbar (send/stop tooltips,
  // model menus, dsh-context modals — all position:fixed against the
  // viewport) pauses the bar's tilt. The persistent stats tooltip hides
  // when the pointer leaves the bar (clearSpot), so hidden ones don't
  // block the tilt from coming back on the next hover.
  if (spot.hasAttribute('data-dsh-inputbar') && inputbarPopover(spot) !== null) return false
  return true
}

/** The first VISIBLE VIEWPORT-ANCHORED (position:fixed) dialog-ish popover
 *  mounted INSIDE the inputbar, if any. Only fixed ones pause the tilt: they
 *  position themselves in viewport coordinates that a transform re-anchors
 *  and cannot be re-pinned per frame. The app's current menus/dialogs are
 *  position:absolute INSIDE the pane (anchored to their trigger) — they ride
 *  the tilted glass coherently and must NOT pause the tilt (clicking a
 *  button used to flatten the glass for the whole popover lifetime). Plain
 *  tooltips ([role=tooltip]) are likewise pinned by the bubble-anchor loop. */
function inputbarPopover(spot: HTMLElement): HTMLElement | null {
  const popover = Array.from(spot.querySelectorAll('[role="dialog"], [role="menu"], [role="listbox"]'))
    .find((candidate) => {
      if (getComputedStyle(candidate).visibility === 'hidden') return false
      return getComputedStyle(candidate).position === 'fixed'
    })
  return popover ?? null
}

/** One hover session: geometry captured at entry, kept fresh by the feed. */
interface SpotSession {
  spot: HTMLElement
  /** The visible glass region in viewport space (cursor math). */
  visual: DOMRect
  /** The visible glass region in spot-local, UNtransformed space (glow
   *  geometry + tilt pivot). */
  local: { left: number; top: number; width: number; height: number }
  /** Glow overlay (null while the glow toggle is off). */
  glow: HTMLElement | null
}

/**
 * Attach the delegated pointer feeds. Everything is document-level: no
 * per-pane listeners, and the rAF merge collapses pointermove bursts to one
 * style write per frame.
 * @returns a disposer that drops listeners, overlays, and inline styles.
 */
export function startSpotlight(): () => void {
  /** The hovered pane (cleared on leave). */
  let current: HTMLElement | null = null
  /** Geometry for the hovered pane. */
  let session: SpotSession | null = null
  let raf = 0
  let refreshRaf = 0
  /** Panes currently carrying a JS-written transform (wipe only those). */
  const tilted = new WeakSet<HTMLElement>()
  /** Pending ease-back removal timers per pane (leave → neutral → cleanup). */
  const settle = new Map<HTMLElement, number>()
  /** Inputbar popovers already revealed after a glide-back (element-keyed:
   *  a React rerender must not restart their fade-in). */
  const revealed = new WeakSet<HTMLElement>()
  /** Panes currently carrying a painted glow radial, innermost first: the
   *  hover session plus every spot-ancestor it sits in. Nested panes — the
   *  sidebar column and the raised new-session button inside it — EACH own
   *  a glow overlay, and a session on the inner pane writes only the
   *  innermost one; without the chain the outer radial froze at its last
   *  painted position (the "glow stuck around the button" bug). */
  let glowChain: SpotSession[] = []

  /** Ease a pressed pane back to neutral, then drop the inline transform. */
  const easeBack = (spot: HTMLElement): void => {
    if (!tilted.has(spot)) return
    tilted.delete(spot)
    // Neutral transform lets the CSS transition glide the pane home; the
    // inline transform is removed after the flight (a residual transform
    // would keep the pane a containing block for fixed descendants).
    spot.style.transform =
      `perspective(${TILT_PERSPECTIVE}px) rotateX(0rad) rotateY(0rad) scale(1)`
    // The glide write and its removal both re-anchor any mounted panel
    // bubble mid-frame — re-pin synchronously so no poisoned frame paints.
    repinPanelBubbles()
    const id = window.setTimeout(() => {
      settle.delete(spot)
      spot.style.removeProperty('transform')
      spot.style.removeProperty('transform-origin')
      repinPanelBubbles()
    }, SETTLE_MS)
    settle.set(spot, id)
  }

  /** Drop every effect this controller wrote onto a pane. `incoming` is the
   *  pointer's next target when leaving (pointerout relatedTarget): chain
   *  panes the incoming hover still sits in keep their radial — the handoff
   *  repaints them at the same cursor position, so a nested handoff
   *  (button ↔ sidebar) never flickers. */
  const clearSpot = (spot: HTMLElement, incoming: EventTarget | null = null): void => {
    spot.removeAttribute(ON_ATTR)
    if (current === spot) {
      current = null
      session = null
      lastPointer = null
    }
    const incomingSpot = closestSpot(incoming)
    for (const s of glowChain) {
      if (incomingSpot !== null && s.spot.contains(incomingSpot)) continue
      s.spot.removeAttribute(ON_ATTR)
      if (s.glow !== null) s.glow.style.removeProperty('background-image')
    }
    glowChain = []
    const glow = spot.querySelector<HTMLElement>(`:scope > [${GLOW_ATTR}]`)
    if (glow !== null) glow.style.removeProperty('background-image')
    // Inputbar popovers own their visibility (tooltips unmount on leave;
    // dialogs/menus are force-released by the keeper only while mounted) —
    // only the reveal marker and the tilt itself are dropped here.
    if (spot.hasAttribute('data-dsh-inputbar')) {
      spot.removeAttribute('data-tilt-revealed')
    }
    easeBack(spot)
  }

  /** The pointer position whose radial was painted last (viewport space).
   *  Geometry refreshes (the keeper's measure) must repaint the radial
   *  against it — see the keeper callback below. */
  let lastPointer: { x: number; y: number } | null = null

  /** Write (or clear) the glow radial for a pointer position. The gradient's
   *  at coordinates are relative to the glow overlay's box (the visible
   *  glass union), so whenever that box moves the radial must be rewritten
   *  in the same breath — a stale at against a moved box misplaces the glow
   *  by exactly the box shift. */
  const writeGlow = (s: SpotSession, clientX: number, clientY: number): void => {
    if (s.glow === null) return
    if (glowGated()) {
      // background-image only: the shorthand would wipe any CSS paint.
      s.glow.style.backgroundImage =
        `radial-gradient(${GLOW_RADIUS}px at ${clientX - s.visual.left}px ${clientY - s.visual.top}px, var(--dsh-aqua-spot-color, ${GLOW_FALLBACK}), transparent 70%)`
    } else {
      // Toggle flipped off mid-hover: drop the last radial so the
      // now-ungated div turns invisible immediately.
      s.glow.style.removeProperty('background-image')
    }
  }

  /** Capture (or refresh) the hover geometry; sets the glow overlay box. */
  const measure = (spot: HTMLElement): SpotSession => {
    const visual = visualRect(spot)
    const local = glassLocalRect(spot)
    const glow = glowGated() ? ensureGlow(spot) : null
    if (glow !== null) {
      glow.style.left = `${local.left}px`
      glow.style.top = `${local.top}px`
      glow.style.width = `${local.width}px`
      glow.style.height = `${local.height}px`
    }
    return { spot, visual, local, glow }
  }

  /** Rebuild the painted-glow chain for the active session: the session pane
   *  plus every spot-ancestor it sits in. Panes that left the chain lose
   *  their radial and marker; with a pointer position every chain radial is
   *  repainted against it — the keeper's refresh path needs that repaint,
   *  since a moved glow box without a repainted radial misplaces the light
   *  by exactly the box shift. */
  const syncChain = (remeasure: boolean, pointer: { x: number; y: number } | null): void => {
    if (session === null || !glowGated()) {
      for (const s of glowChain) {
        s.spot.removeAttribute(ON_ATTR)
        if (s.glow !== null) s.glow.style.removeProperty('background-image')
      }
      glowChain = []
      return
    }
    const want = [session.spot, ...ancestorSpots(session.spot)]
    for (const s of glowChain) {
      if (want.includes(s.spot)) continue
      s.spot.removeAttribute(ON_ATTR)
      if (s.glow !== null) s.glow.style.removeProperty('background-image')
    }
    const next: SpotSession[] = []
    for (const spot of want) {
      let s = spot === session.spot ? session : glowChain.find((c) => c.spot === spot)
      if (s === undefined || remeasure) s = measure(spot)
      spot.setAttribute(ON_ATTR, '')
      if (s.glow !== null && pointer !== null) writeGlow(s, pointer.x, pointer.y)
      next.push(s)
    }
    glowChain = next
  }

  /** Write the glow gradient and/or the tilt transform for the pointer position. */
  const paint = (s: SpotSession, clientX: number, clientY: number): void => {
    if (raf !== 0) return
    raf = requestAnimationFrame(() => {
      raf = 0
      // Superseded: a keeper refresh replaced the session (fresh geometry)
      // while this paint was queued — the refresh already repainted the
      // radial against the last pointer, so a stale write here would undo it.
      if (session !== s) return
      const { spot, visual, local } = s
      // Over a gutter / padding region, not the glass — nothing to paint.
      if (!inside(visual, clientX, clientY)) {
        clearSpot(spot)
        return
      }
      let glow = s.glow
      if (glow === null && glowGated()) {
        // Toggle flipped on mid-hover: late-bind the glow overlay.
        s = session = measure(spot)
        glow = s.glow
        // The chain members were measured glow-less; rebuild so the nested
        // ancestors light up together with the session pane.
        syncChain(true, { x: clientX, y: clientY })
      }
      if (glow !== null) {
        lastPointer = { x: clientX, y: clientY }
        writeGlow(s, clientX, clientY)
        // Chain ancestors: the light follows the cursor across every nested
        // pane — the session's own overlay only covers the session pane's
        // box (the button's glow alone never reaches the sidebar glass
        // around it).
        for (const c of glowChain) {
          if (c.spot === s.spot || c.glow === null) continue
          writeGlow(c, clientX, clientY)
        }
      }
      if (tiltGated() && tiltable(spot)) {
        // Normalized cursor offset from the glass center, clamped to ±0.5 —
        // the official card's formula, sign-verified against its inline
        // transform: cursor right ⇒ rotateY POSITIVE, cursor TOP ⇒ rotateX
        // POSITIVE — the edge under the cursor sinks, the far edge lifts.
        const dx = Math.min(0.5, Math.max(-0.5, (clientX - visual.left) / visual.width - 0.5))
        const dy = Math.min(0.5, Math.max(-0.5, (clientY - visual.top) / visual.height - 0.5))
        // Large boards (the trajectory timeline, a full-page plugin view)
        // get half the magnitude so the press stays gentle; card-sized
        // spots get the full recipe.
        const tiltMax = Math.min(visual.width, visual.height) > TILT_GENTLE_MIN ? TILT_MAX * 0.5 : TILT_MAX
        // Rotate about the visible glass center (spot-local, untransformed).
        // Same recipe for every pane — the sidebar and its collapsed rail
        // included. The INPUTBAR adds a constant compensating lift: it is
        // the bottom-most pane inside the chat scroll container
        // (overflow-y: auto), and a center-origin scale(1.01) + perspective
        // rotation projects its bottom edge up to ~1.3px past its layout
        // box (measured: the poke flipped the stock scrollbar on, the 8px
        // gutter shifted the layout, the next measure re-tilted — the
        // scrollbar flickered on every pointer move inside the bar and
        // appeared mid-stream while the pointer rested on the bar after
        // clicking send). The lift equals that WORST-CASE poke
        // (scale term + corner term, padded), so the projected box never
        // crosses the layout bottom while the pivot, the angles and the
        // scale stay exactly the official recipe; ~1.5px on a hovered pane
        // that already moves ~1px at its edges is imperceptible. The top/
        // side pokes are scroll-harmless (top never adds scrollHeight, the
        // right poke lands in the container's overflow-x: hidden).
        const pendingGlide = settle.get(spot)
        if (pendingGlide !== undefined) {
          clearTimeout(pendingGlide)
          settle.delete(spot)
          spot.style.removeProperty('transition')
        }
        const isInputbar = spot.hasAttribute('data-dsh-inputbar')
        const lift = isInputbar
          ? (local.height / 2) * 0.01
            + (local.height / 2) * (visual.width / 2) * tiltMax / TILT_PERSPECTIVE
            + 0.4
          : 0
        spot.style.transformOrigin =
          `${local.left + local.width / 2}px ${local.top + local.height / 2}px`
        spot.style.transform =
          `perspective(${TILT_PERSPECTIVE}px) rotateX(${tiltMax * -2 * dy}rad) rotateY(${tiltMax * 2 * dx}rad) scale(1.01)`
          + (lift > 0 ? ` translateY(${-lift.toFixed(2)}px)` : '')
        tilted.add(spot)
        // The tilt write (re-)anchors mounted panel bubbles into the pane's
        // coordinate space mid-frame — without a same-task re-pin, exactly
        // one poisoned frame reaches layout+paint (the scrollbar jump).
        repinPanelBubbles()
      } else if (tilted.has(spot)) {
        // A guarded pane — a VISIBLE dialog/menu/listbox mounted inside the
        // inputbar — must drop the transform IMMEDIATELY: those popovers
        // clamp against the viewport by measuring their rendered box, which
        // a held transform poisons (the pane is their containing block), and
        // they cannot be re-pinned per frame. The instant release coincides
        // with the popover's own appearance, so nothing reads as abrupt;
        // every other release (tilt toggled off mid-hover) keeps the eased
        // glide. Plain tooltips stay here — bubble-anchor pins them under
        // the live tilt.
        if (spot.hasAttribute('data-dsh-inputbar') && inputbarPopover(spot) !== null) {
          spot.style.setProperty('transition', 'none')
          spot.style.removeProperty('transform')
          spot.style.removeProperty('transform-origin')
          void spot.offsetWidth
          spot.style.removeProperty('transition')
          tilted.delete(spot)
          repinPanelBubbles()
        } else {
          easeBack(spot)
        }
      }
    })
  }

  const onMove = (event: PointerEvent): void => {
    if (!hoverGated()) return
    // Position-based sweep: the pointer can leave the session's glass
    // without a usable pointerout — the outgoing event fires while the
    // cursor is still inside the pane's rect (the hovered ELEMENT changes
    // at a child boundary before the pane's own border, or the pointer
    // exits the window edge) and the inside() early return swallows it;
    // every later pointermove then has its target OUTSIDE any spot and
    // used to return before any clear — the session, radial and tilt froze
    // at the crossing frame (the glow stuck on the sidebar report).
    // Sweep by POSITION: outside the session's visual, the session ends no
    // matter what the event target is now.
    if (session !== null && !inside(session.visual, event.clientX, event.clientY)) {
      const targetSpot = closestSpot(event.target)
      if (targetSpot !== session.spot
        && (targetSpot === null || (!targetSpot.contains(session.spot) && !session.spot.contains(targetSpot)))) {
        clearSpot(session.spot)
      }
    }
    const spot = closestSpot(event.target)
    if (spot === null || session?.spot !== spot) return
    // The tilt stays LIVE over buttons — flattening the pane just because
    // the cursor crossed a control read as the glass abruptly "dropping"
    // (the one thing every variant of trigger-snapping got complained about).
    // Popover safety is owned entirely by tiltable() + the keeper instead:
    // paint already skips (and eases home) a pane with a VISIBLE popover
    // mounted inside the bar, and the keeper glides the transform away and
    // only then reveals the popover at its exact viewport spot — so no
    // bubble is ever painted under a live transform.
    paint(session, event.clientX, event.clientY)
  }

  const onOver = (event: PointerEvent): void => {
    if (!hoverGated()) return
    const spot = closestSpot(event.target)
    if (spot === null) return
    // The settings overlay renders INSIDE the sidebar column: while it is
    // open, the sidebar stays out of every hover effect.
    if (spot.matches('[class*="sidebarCol"]') && document.querySelector('[role="dialog"]') !== null) return
    // Release ANY stale session before the new one starts — including the
    // nested handoff (sidebar → its raised button): the parent's tilt must
    // ease home while the chain repaints its glow at the same cursor
    // position (both writes are synchronous in this turn, so no painted
    // frame ever shows a gap). A swallowed pointerout at a rect boundary or
    // a removed element under the cursor used to leave the old pane's
    // radial and tilt frozen (the stuck-glow reports).
    if (current !== null && current !== spot) {
      clearSpot(current, event.target)
    }
    // Gutter/padding entries never start a session (and must not cancel a
    // pending ease-back settle), so the glass check comes first.
    const next = measure(spot)
    if (!inside(next.visual, event.clientX, event.clientY)) return
    // Re-entry during an ease-back: cancel the pending inline cleanup.
    const id = settle.get(spot)
    if (id !== undefined) {
      clearTimeout(id)
      settle.delete(spot)
    }
    spot.setAttribute(ON_ATTR, '')
    current = spot
    session = next
    // Remember the entry position BEFORE queuing the first paint: a keeper
    // refresh may supersede that queued paint (fresh session object), and
    // the refresh only repaints the radial against lastPointer — with the
    // pointer stationary since entry (lastPointer null) the radial would
    // never paint at all (the "glow stuck" report).
    lastPointer = { x: event.clientX, y: event.clientY }
    // Build the glow chain (session pane + its spot-ancestors) and paint
    // every radial at the entry position — the chain must not wait for the
    // queued paint below (which a keeper refresh may supersede).
    syncChain(true, lastPointer)
    paint(next, event.clientX, event.clientY)
  }

  const onOut = (event: PointerEvent): void => {
    const spot = closestSpot(event.target)
    if (spot === null || spot !== current) return
    // Moving between children keeps the effects live; leaving the visible
    // glass (including into the wrapper's gutters) clears them. The handoff
    // target keeps its chain painted (see clearSpot) so nested handoffs
    // don't flicker.
    if (session !== null && inside(session.visual, event.clientX, event.clientY)) return
    clearSpot(spot, event.relatedTarget)
  }

  // The glow divs live with the panes through React re-renders; DOM/layout
  // changes also refresh the active hover session (coalesced).
  const keeper = startOverlayKeeper(() => {
    // The settings dialog mounts INSIDE the sidebar column — release the
    // sidebar with a SNAP, not a glide: removing the inline transform while
    // the CSS transition is live would keep the COMPUTED transform alive
    // for ~0.1s and trap the panel's fixed overlay in the column for those
    // frames (the "stuck in the sidebar for a moment" bug). Disabling the
    // transition around the removal makes the release instant.
    for (const spot of spotElements()) {
      if (!spot.matches('[class*="sidebarCol"]')) continue
      if (spot.querySelector('[role="dialog"]') === null) continue
      // Only the HOVERED pane loses its glow marker: a nested session (the
      // new-session button) keeps the column's chain glow alive — the light
      // sits behind the dialog's deepened backdrop and stays on the cursor.
      if (current === spot) spot.removeAttribute(ON_ATTR)
      const id = settle.get(spot)
      if (id !== undefined) {
        clearTimeout(id)
        settle.delete(spot)
      }
      tilted.delete(spot)
      spot.style.setProperty('transition', 'none')
      spot.style.removeProperty('transform')
      spot.style.removeProperty('transform-origin')
      void spot.offsetWidth
      spot.style.removeProperty('transition')
      repinPanelBubbles()
      if (current === spot) {
        for (const s of glowChain) {
          if (s.spot !== spot) continue
          if (s.glow !== null) s.glow.style.removeProperty('background-image')
        }
        glowChain = glowChain.filter((s) => s.spot !== spot)
        current = null
        session = null
      }
    }
    // Inputbar popovers that are VIEWPORT-ANCHORED (position:fixed) clamp
    // themselves by measuring their rendered box — a live tilt transform
    // would re-anchor them into the bar and poison that measurement.
    // GLIDE-BACK, not snap: the transform eases home over 0.12s, after
    // which the popover is revealed ONCE (element-keyed — rerenders must
    // not restart its fade-in). The app's current menus/dialogs are
    // position:absolute INSIDE the pane (anchored to their trigger) — they
    // ride the tilted glass coherently and are deliberately skipped here,
    // so clicking a button keeps the tilt alive. Plain tooltips are
    // likewise re-pinned every frame by bubble-anchor.
    for (const spot of spotElements()) {
      if (!spot.hasAttribute('data-dsh-inputbar')) continue
      const popovers = Array.from(spot.querySelectorAll('[role="dialog"], [role="menu"], [role="listbox"]'))
        .filter((popover) => getComputedStyle(popover).position === 'fixed')
      if (popovers.length === 0) continue
      const unrevealed = popovers.filter((popover) => !revealed.has(popover))
      const reveal = (): void => {
        spot.setAttribute('data-tilt-revealed', '')
        for (const popover of unrevealed) {
          revealed.add(popover)
          popover.style.animation = 'none'
          void popover.offsetWidth
          popover.style.removeProperty('animation')
        }
      }
      if (spot.style.transform === '') {
        reveal()
        continue
      }
      if (settle.has(spot)) continue
      spot.style.setProperty('transition', 'transform 0.12s ease-out')
      spot.style.transform = `perspective(${TILT_PERSPECTIVE}px) rotateX(0rad) rotateY(0rad) scale(1)`
      tilted.delete(spot)
      repinPanelBubbles()
      const id = window.setTimeout(() => {
        settle.delete(spot)
        spot.style.removeProperty('transition')
        spot.style.removeProperty('transform')
        spot.style.removeProperty('transform-origin')
        repinPanelBubbles()
        reveal()
      }, 120)
      settle.set(spot, id)
    }
    if (session === null || refreshRaf !== 0) return
    refreshRaf = requestAnimationFrame(() => {
      refreshRaf = 0
      if (session === null) return
      session = measure(session.spot)
      // The refresh may have MOVED the glow overlay's box: the visible glass
      // union grows/shrinks with anchored popovers (a click-opened composer
      // menu), the docked stats band, and layout shifts. The radial's at
      // coordinates are painted relative to that box and are otherwise only
      // rewritten by the next pointermove — with the pointer at rest (the
      // common case: a click opened a popover under it) the stale at against
      // the moved box misplaces the glow by exactly the box shift (measured:
      // 79px the instant a composer menu opened under a resting cursor).
      // Repaint against the last pointer so box and radial never disagree.
      if (lastPointer !== null) writeGlow(session, lastPointer.x, lastPointer.y)
      // The same box shift can move ANY chain member (the sidebar column
      // resizes, the button shifts): re-measure the ancestors and repaint
      // their radials against the last pointer too.
      syncChain(true, lastPointer)
    })
  })

  document.addEventListener('pointermove', onMove, { passive: true })
  document.addEventListener('pointerover', onOver, { passive: true })
  document.addEventListener('pointerout', onOut, { passive: true })

  return () => {
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerover', onOver)
    document.removeEventListener('pointerout', onOut)
    keeper()
    if (raf !== 0) cancelAnimationFrame(raf)
    if (refreshRaf !== 0) cancelAnimationFrame(refreshRaf)
    for (const id of settle.values()) clearTimeout(id)
    settle.clear()
    glowChain = []
    for (const spot of spotElements()) {
      spot.removeAttribute(ON_ATTR)
      if (tilted.has(spot)) {
        tilted.delete(spot)
        spot.style.removeProperty('transform')
        spot.style.removeProperty('transform-origin')
      }
    }
  }
}
