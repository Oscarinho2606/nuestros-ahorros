-- ================================================
-- NUESTROS AHORROS - Schema para Supabase
-- Corre esto en: Supabase → SQL Editor → New query
-- ================================================

-- Tabla de movimientos (ingresos, gastos, ahorros)
CREATE TABLE IF NOT EXISTS transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL CHECK (type IN ('income', 'expense', 'savings')),
  amount      DECIMAL(14,2) NOT NULL CHECK (amount > 0),
  category    TEXT NOT NULL DEFAULT 'other',
  description TEXT DEFAULT '',
  date        TEXT NOT NULL,
  person      TEXT NOT NULL DEFAULT 'person1' CHECK (person IN ('person1', 'person2')),
  recurring   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de metas de ahorro
CREATE TABLE IF NOT EXISTS goals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  icon           TEXT NOT NULL DEFAULT '🎯',
  target_amount  DECIMAL(14,2) NOT NULL CHECK (target_amount > 0),
  current_amount DECIMAL(14,2) DEFAULT 0,
  deadline       TEXT,
  notes          TEXT DEFAULT '',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de aportes a metas
CREATE TABLE IF NOT EXISTS contributions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id    UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  amount     DECIMAL(14,2) NOT NULL CHECK (amount > 0),
  person     TEXT NOT NULL DEFAULT 'person1',
  date       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de presupuestos por categoría
CREATE TABLE IF NOT EXISTS budgets (
  category TEXT PRIMARY KEY,
  amount   DECIMAL(14,2) NOT NULL CHECK (amount > 0)
);

-- Tabla de configuración (fila única)
CREATE TABLE IF NOT EXISTS settings (
  id              TEXT PRIMARY KEY DEFAULT 'singleton',
  person1         TEXT DEFAULT 'Yo',
  person2         TEXT DEFAULT 'Mi Amor',
  currency        TEXT DEFAULT '$',
  expected_income DECIMAL(14,2) DEFAULT 0,
  savings_pct     DECIMAL(5,2) DEFAULT 20
);

-- Insertar configuración por defecto
INSERT INTO settings (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;

-- Deshabilitar RLS (la app es privada, la anon key la comparten los dos)
ALTER TABLE transactions  DISABLE ROW LEVEL SECURITY;
ALTER TABLE goals         DISABLE ROW LEVEL SECURITY;
ALTER TABLE contributions DISABLE ROW LEVEL SECURITY;
ALTER TABLE budgets       DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings      DISABLE ROW LEVEL SECURITY;

-- Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_tx_date   ON transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_tx_type   ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_tx_person ON transactions(person);
CREATE INDEX IF NOT EXISTS idx_contrib_goal ON contributions(goal_id);

-- Activar Realtime (cambios en tiempo real entre dispositivos)
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE goals;
ALTER PUBLICATION supabase_realtime ADD TABLE contributions;
ALTER PUBLICATION supabase_realtime ADD TABLE settings;

-- Tabla de pagos pendientes / futuros
CREATE TABLE IF NOT EXISTS pending_payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  amount       DECIMAL(14,2) NOT NULL CHECK (amount > 0),
  category     TEXT NOT NULL DEFAULT 'other',
  due_date     TEXT NOT NULL,
  person       TEXT NOT NULL DEFAULT 'person1',
  recurring    BOOLEAN DEFAULT FALSE,
  notes        TEXT DEFAULT '',
  paid         BOOLEAN DEFAULT FALSE,
  paid_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pending_payments DISABLE ROW LEVEL SECURITY;
ALTER PUBLICATION supabase_realtime ADD TABLE pending_payments;
