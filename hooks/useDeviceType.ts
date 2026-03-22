'use client'

import { useState, useEffect } from 'react'

export type DeviceType = 'phone' | 'desktop'

interface DeviceInfo {
  deviceType: DeviceType
  isTouch: boolean
}

// Query parameter override: ?touch=1 or ?mobile=1 forces touch/mobile mode
function getQueryOverrides(): { forceTouch: boolean; forceMobile: boolean } {
  if (typeof window === 'undefined') return { forceTouch: false, forceMobile: false }
  const params = new URLSearchParams(window.location.search)
  const forceTouch = params.get('touch') === '1'
  const forceMobile = params.get('mobile') === '1'
  return { forceTouch, forceMobile }
}

function detectTouch(): boolean {
  if (typeof window === 'undefined') return false
  // Primary check: CSS media query for coarse pointer (touch screens)
  if (window.matchMedia?.('(pointer: coarse)').matches) return true
  // iPadOS with Magic Keyboard: primary pointer is fine, but touch is still available
  if (window.matchMedia?.('(any-pointer: coarse)').matches) return true
  // Fallback: touch event support
  if ('ontouchstart' in window) return true
  // Fallback: navigator check
  if (navigator.maxTouchPoints > 0) return true
  return false
}

function classify(width: number): DeviceType {
  if (width < 768) return 'phone'
  return 'desktop'
}

export function useDeviceType(): DeviceInfo {
  // Resolve query overrides once per render so that both the useState lazy
  // initializer and the useEffect closure always see the same values.
  // Calling getQueryOverrides() twice (once in useState and once in useEffect)
  // could produce inconsistent forceTouch/forceMobile values if window.location
  // changes between those two calls (e.g. client-side navigation that does not
  // remount this component).
  const queryOverrides = getQueryOverrides()

  const [info, setInfo] = useState<DeviceInfo>(() => {
    if (typeof window === 'undefined') return { deviceType: 'desktop', isTouch: false }
    const { forceTouch, forceMobile } = queryOverrides
    const isTouch = forceTouch || detectTouch()
    const deviceType = forceMobile ? 'phone' : classify(window.innerWidth)
    return { deviceType, isTouch }
  })

  useEffect(() => {
    // Use the overrides captured at hook-call time (same as the useState initializer).
    const { forceTouch, forceMobile } = queryOverrides

    const update = () => {
      const isTouch = forceTouch || detectTouch()
      const deviceType = forceMobile ? 'phone' : classify(window.innerWidth)
      setInfo(prev => {
        if (prev.deviceType === deviceType && prev.isTouch === isTouch) return prev
        return { deviceType, isTouch }
      })
    }

    // Listen for resize
    window.addEventListener('resize', update)

    // Listen for pointer capability changes (e.g. connecting/disconnecting mouse)
    const mql = window.matchMedia?.('(pointer: coarse)')
    const mqlAny = window.matchMedia?.('(any-pointer: coarse)')
    if (mql?.addEventListener) {
      mql.addEventListener('change', update)
    }
    if (mqlAny?.addEventListener) {
      mqlAny.addEventListener('change', update)
    }

    // Initial check
    update()

    return () => {
      window.removeEventListener('resize', update)
      if (mql?.removeEventListener) {
        mql.removeEventListener('change', update)
      }
      if (mqlAny?.removeEventListener) {
        mqlAny.removeEventListener('change', update)
      }
    }
  // queryOverrides is intentionally excluded: getQueryOverrides() returns a new object each call,
  // so including it would re-run the effect on every render and re-register all listeners.
  // The value is captured at mount time matching the useState initializer (see comment above useState).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return info
}
