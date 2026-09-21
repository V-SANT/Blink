import { useEffect, useRef, useState } from 'react'

/**
 * Términos y Condiciones.
 *
 * El chiste: no te dejan leerlos, los "leen por vos" a una velocidad imposible y
 * después certifican que los leíste. Dura 3.5 segundos — lo suficiente para que se
 * entienda el gag, lo bastante poco para no frenar a nadie el día del evento.
 */

const CLAUSES: [string, string][] = [
  [
    '1. Objeto',
    'Blink administra el tiempo del Usuario. El Usuario reconoce que dicho tiempo tiene un valor de mercado y cede su administración a Blink por el término de noventa (90) segundos diarios, prorrogables automáticamente de por vida.',
  ],
  [
    '2. Del Índice de Eficiencia Comunicacional',
    'El IEC es propiedad exclusiva de Blink y no del Usuario. Blink podrá modificarlo retroactivamente, sin notificación, expresión de causa ni posibilidad de apelación. El IEC no es transferible, no es canjeable y no significa nada.',
  ],
  [
    '3. De la amabilidad',
    'La amabilidad no constituye una estrategia válida dentro de la plataforma. El Usuario acepta que todo gesto de calidez será medido, clasificado y, cuando corresponda, penalizado.',
  ],
  [
    '4. De la Presencia Obligatoria',
    'Durante los 90 segundos asignados, el Usuario renuncia voluntariamente a su derecho de abandonar la conversación. Cualquier intento de minimizar, cerrar o ignorar la aplicación será informado a la contraparte en tiempo real y en color rojo.',
  ],
  [
    '5. Del interés',
    'Resultar interesante es responsabilidad exclusiva del Usuario. Blink no garantiza compatibilidad, reciprocidad, continuidad, ni que la otra persona esté prestando atención.',
  ],
  [
    '6. Del Contacto Efímero',
    'El contacto de la contraparte se exhibirá durante mil (1.000) milisegundos. Blink no se responsabiliza por parpadeos, distracciones, reflejos deficientes ni por la vida que el Usuario no tuvo por no haber leído a tiempo.',
  ],
  [
    '7. De la vulnerabilidad',
    'Toda manifestación de sinceridad emocional será registrada como evento de riesgo. El Usuario acepta que abrirse con un desconocido constituye una decisión de producto desaconsejada por esta plataforma.',
  ],
  [
    '8. De los datos',
    'No conservamos los mensajes. No conservamos los perfiles. No conservamos nada. Esto no es una política de privacidad: es una descripción de nuestra arquitectura y, si somos honestos, de nuestro modelo de vínculos.',
  ],
  [
    '9. De la rescisión',
    'El Usuario puede darse de baja en cualquier momento. La baja se procesa durante la próxima sesión asignada, a la cual el Usuario deberá asistir.',
  ],
  [
    '10. Jurisdicción',
    'Para toda controversia, las partes se someten a la jurisdicción del algoritmo, renunciando a cualquier otro fuero, incluido el del sentido común.',
  ],
]

const READ_MS = 3500

export function Terms({ onAccept, onCancel }: { onAccept: () => void; onCancel: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(0)
  const done = progress >= 100

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const start = performance.now()
    let raf = 0

    const step = (now: number) => {
      const p = Math.min(1, (now - start) / READ_MS)
      // Scroll a velocidad imposible: el texto pasa, no se lee.
      box.scrollTop = (box.scrollHeight - box.clientHeight) * p
      setProgress(Math.round(p * 100))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)

    // requestAnimationFrame no corre con la pestaña oculta. Si alguien bloquea el
    // teléfono justo acá, la barra quedaría congelada y el botón de aceptar no
    // aparecería nunca. Este timeout garantiza que siempre se pueda seguir.
    const failsafe = setTimeout(() => setProgress(100), READ_MS + 300)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(failsafe)
    }
  }, [])

  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label="Términos y Condiciones">
      <div className="modal">
        <div className="modal-head">
          <div className="modal-title">Términos y Condiciones</div>
          <div className="modal-sub">
            {done ? 'Lectura completada' : `Leyendo por vos… ${progress}%`}
          </div>
          <div className="modal-track">
            <div className="modal-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="modal-body" ref={boxRef} aria-hidden="true">
          {CLAUSES.map(([title, body]) => (
            <div key={title} className="clause">
              <h4>{title}</h4>
              <p>{body}</p>
            </div>
          ))}
          <div className="clause">
            <h4>11. Aceptación</h4>
            <p>
              El Usuario declara haber leído la totalidad del presente documento. Esta declaración
              es verificable: el sistema registró que el texto pasó frente a sus ojos.
            </p>
          </div>
        </div>

        <div className="modal-foot">
          {done ? (
            <>
              <p className="modal-note">
                Confirmamos que leíste y comprendiste los {CLAUSES.length + 1} artículos.
              </p>
              <div className="btn-row">
                <button className="btn row ghost" onClick={onCancel}>
                  Volver
                </button>
                <button className="btn row" onClick={onAccept}>
                  Acepto
                </button>
              </div>
            </>
          ) : (
            <p className="modal-note">Aguardá. Estamos leyendo en tu nombre.</p>
          )}
        </div>
      </div>
    </div>
  )
}
