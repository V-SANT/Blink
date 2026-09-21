import { useEffect, useState } from 'react'

/**
 * Alto del teclado virtual en px, publicado como variable CSS (`--kb`).
 *
 * El navegador no achica la página cuando aparece el teclado: la tapa. Una pantalla de
 * 100dvh queda entonces con el composer y los últimos mensajes debajo del teclado, y el
 * navegador "arregla" eso scrolleando el documento entero — que es exactamente el salto
 * al fondo que se ve en el celular.
 *
 * `visualViewport` sí reporta el área que queda visible: la diferencia contra la ventana
 * es el teclado. En Chrome Android, con `interactive-widget=resizes-content` en el meta
 * viewport, el layout ya se achica solo y esta cuenta da 0, así que no se descuenta dos
 * veces. En iOS, que ignora ese meta, esta es la única fuente de verdad.
 */
export function useKeyboardInset(active: boolean) {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    if (!active) return
    const root = document.documentElement
    // Mientras la sala está montada el documento no scrollea: todo el alto lo maneja
    // la sala, que es `position: fixed`. Sin esto iOS rebota y se lleva el header.
    root.classList.add('room-open')

    const vv = window.visualViewport
    let raf = 0
    const measure = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        if (!vv) return
        const kb = Math.round(window.innerHeight - vv.height - vv.offsetTop)
        // Menos de ~80px no es un teclado: es la barra de direcciones colapsándose.
        const next = kb > 80 ? kb : 0
        root.style.setProperty('--kb', `${next}px`)
        setInset(next)
        // iOS igual scrollea el documento para "hacer lugar". Como la sala ya descuenta
        // el teclado, ese scroll solo esconde el header: lo deshacemos.
        if (next > 0 && window.scrollY !== 0) window.scrollTo(0, 0)
      })
    }

    measure()
    vv?.addEventListener('resize', measure)
    vv?.addEventListener('scroll', measure)
    return () => {
      cancelAnimationFrame(raf)
      vv?.removeEventListener('resize', measure)
      vv?.removeEventListener('scroll', measure)
      root.classList.remove('room-open')
      root.style.removeProperty('--kb')
    }
  }, [active])

  return inset
}
