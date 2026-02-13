-- ============================================================
-- Cat Vegetation Toxin Database — Schema
-- PostgreSQL 15+
-- ============================================================

-- ----------------------------------------------------------
-- Custom ENUM types
-- ----------------------------------------------------------
CREATE TYPE severity_level AS ENUM ('mild', 'moderate', 'severe', 'fatal');


-- ==========================================================
-- 1. plants
-- ==========================================================
CREATE TABLE plants (
    id              SERIAL PRIMARY KEY,
    common_name     VARCHAR(150) NOT NULL,
    scientific_name VARCHAR(200) NOT NULL UNIQUE,
    family          VARCHAR(100),
    description     TEXT,
    image_url       TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_plants_common_name     ON plants (common_name);
CREATE INDEX idx_plants_family          ON plants (family);


-- ==========================================================
-- 2. toxic_parts  (lookup table)
-- ==========================================================
CREATE TABLE toxic_parts (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE   -- e.g. "Leaf", "Bulb", "Pollen"
);


-- ==========================================================
-- 3. plant_toxic_parts  (junction)
-- ==========================================================
CREATE TABLE plant_toxic_parts (
    plant_id      INT NOT NULL REFERENCES plants(id)      ON DELETE CASCADE,
    toxic_part_id INT NOT NULL REFERENCES toxic_parts(id)  ON DELETE CASCADE,
    PRIMARY KEY (plant_id, toxic_part_id)
);


-- ==========================================================
-- 4. toxins
-- ==========================================================
CREATE TABLE toxins (
    id               SERIAL PRIMARY KEY,
    name             VARCHAR(150) NOT NULL UNIQUE,
    chemical_formula VARCHAR(100),
    description      TEXT        -- mechanism of action summary
);

CREATE INDEX idx_toxins_name ON toxins (name);


-- ==========================================================
-- 5. plant_toxins  (junction + metadata)
-- ==========================================================
CREATE TABLE plant_toxins (
    plant_id            INT  NOT NULL REFERENCES plants(id)  ON DELETE CASCADE,
    toxin_id            INT  NOT NULL REFERENCES toxins(id)  ON DELETE CASCADE,
    concentration_notes TEXT,          -- free-text notes on concentration
    PRIMARY KEY (plant_id, toxin_id)
);


-- ==========================================================
-- 6. symptoms
-- ==========================================================
CREATE TABLE symptoms (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(150) NOT NULL UNIQUE,
    body_system VARCHAR(100)           -- e.g. "Gastrointestinal", "Renal"
);

CREATE INDEX idx_symptoms_body_system ON symptoms (body_system);


-- ==========================================================
-- 7. plant_symptoms  (junction + clinical metadata)
-- ==========================================================
CREATE TABLE plant_symptoms (
    plant_id   INT            NOT NULL REFERENCES plants(id)    ON DELETE CASCADE,
    symptom_id INT            NOT NULL REFERENCES symptoms(id)  ON DELETE CASCADE,
    severity   severity_level NOT NULL DEFAULT 'moderate',
    onset      VARCHAR(100),           -- e.g. "Within 6–12 hours"
    notes      TEXT,
    PRIMARY KEY (plant_id, symptom_id)
);


-- ==========================================================
-- 8. treatments
-- ==========================================================
CREATE TABLE treatments (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    description TEXT
);


-- ==========================================================
-- 9. plant_treatments  (junction + ordering)
-- ==========================================================
CREATE TABLE plant_treatments (
    plant_id     INT  NOT NULL REFERENCES plants(id)     ON DELETE CASCADE,
    treatment_id INT  NOT NULL REFERENCES treatments(id) ON DELETE CASCADE,
    priority     INT  NOT NULL DEFAULT 0,    -- lower = higher priority
    notes        TEXT,
    PRIMARY KEY (plant_id, treatment_id)
);


-- ==========================================================
-- 10. sources  (references / provenance)
-- ==========================================================
CREATE TABLE sources (
    id          SERIAL PRIMARY KEY,
    plant_id    INT          NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
    title       VARCHAR(300) NOT NULL,
    url         TEXT,
    accessed_at DATE
);

CREATE INDEX idx_sources_plant_id ON sources (plant_id);


-- ==========================================================
-- Trigger: auto-update `updated_at` on plants
-- ==========================================================
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_plants_updated_at
    BEFORE UPDATE ON plants
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();
