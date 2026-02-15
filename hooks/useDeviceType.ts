'use client'

import { useState, useEffect } from 'react'

export type DeviceType = 'phone' | 'tablet' | 'desktop'

interface DeviceInfo {
  deviceType: DeviceType
  isTouch: boolean
}

function detectTouch(): boolean {
  if (typeof window === 'undefined') return false
  // Primary check: CSS media query for coarse pointer (touch screens)
  if (window.matchMedia?.('(pointer: coarse)').matches) return true
  // Fallback: touch event support
  if ('ontouchstart' in window) return true
  // Fallback: navigator check
  if (navigator.maxTouchPoints > 0) return true
  return false
}

function classify(width: number, isTouch: boolean): DeviceType {
  if (width < 768) return 'phone'
  // Touch devices at any width >= 768 get tablet experience
  // Non-touch devices between 768-1023 also get tablet (small laptop screens are fine with it)
  if (isTouch) return 'tablet'
  if (width < 1024) return 'tablet'
  return 'desktop'
}

export function useDeviceType(): DeviceInfo {
  const [info, setInfo] = useState<DeviceInfo>(() => {
    if (typeof window === 'undefined') return { deviceType: 'desktop', isTouch: false }
    const isTouch = detectTouch()
    const deviceType = classify(window.innerWidth, isTouch)
    return { deviceType, isTouch }
  })

  useEffect(() => {
    const update = () => {
      const isTouch = detectTouch()
      const deviceType = classify(window.innerWidth, isTouch)
      setInfo(prev => {
        if (prev.deviceType === deviceType && prev.isTouch === isTouch) return prev
        return { deviceType, isTouch }
      })
    }

    // Listen for resize
    window.addEventListener('resize', update)

    // Listen for pointer capability changes (e.g. connecting/disconnecting mouse)
    const mql = window.matchMedia?.('(pointer: coarse)')
    if (mql?.addEventListener) {
      mql.addEventListener('change', update)
    }

    // Initial check
    update()

    return () => {
      window.removeEventListener('resize', update)
      if (mql?.removeEventListener) {
        mql.removeEventListener('change', update)
      }
    }
  }, [])

  return info
}
