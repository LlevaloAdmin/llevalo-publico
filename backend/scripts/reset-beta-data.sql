-- Borra cuentas y datos operativos de la beta; conserva configuracion_tarifas
-- y configuracion_pago_movil. Ejecutar solo en la base Neon correcta.
BEGIN;

DO $$
DECLARE
  tabla TEXT;
BEGIN
  IF to_regclass('public.usuarios') IS NULL THEN
    RAISE EXCEPTION 'No existe public.usuarios; se cancela el reinicio.';
  END IF;

  FOREACH tabla IN ARRAY ARRAY[
    'auth_action_tokens',
    'sesiones_activas',
    'auth_sessions',
    'notification_devices',
    'evaluaciones_usuarios',
    'historial_pagos',
    'postulaciones',
    'chat_mensajes',
    'actividad_admin',
    'postulaciones_repartidor',
    'movimientos_saldo',
    'saldos_corporativos',
    'pedidos',
    'usuarios'
  ]
  LOOP
    IF to_regclass(format('public.%I', tabla)) IS NOT NULL THEN
      EXECUTE format('DELETE FROM public.%I', tabla);
    END IF;
  END LOOP;
END $$;

COMMIT;

SELECT COUNT(*) AS cuentas_restantes FROM public.usuarios;
