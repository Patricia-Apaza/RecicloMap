# Forma de trabajo con Git

Repositorio en GitHub, rama principal `main`.

## Ramas

- `main` está protegida: no se sube directo; todo entra por pull request.
- Ramas cortas desde `main`, una por tema:
  - `feat/f04-registro-reciclador` funcionalidad
  - `fix/…` corrección
  - `docs/…` documentación
  - `chore/…` configuración y mantenimiento
- Una sola rama con migraciones de base de datos a la vez. Quien la lleve actualiza desde `main` antes de fusionar.

## Pull requests

- Una aprobación y la integración continua en verde.
- Dos aprobaciones si el cambio toca migraciones, autenticación o permisos.
- Fusión por squash.
- Al cerrar cada fase se marca una etiqueta `fase-NN`.

## Mensajes de commit

Formato Conventional Commits, en español:

```
feat(api): agregar registro de reciclador
fix(web): corregir el semáforo con dos opciones
docs: explicar cómo crear una migración
```

Tipos: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`.

## Configuración recomendada en GitHub

En **Settings → Branches → Add branch ruleset** para `main`:

1. Require a pull request before merging, con 1 aprobación.
2. Require status checks to pass: `Formato, lint, tipos y pruebas unitarias` y `Base de datos, extremo a extremo y Postman`.
3. Block force pushes.
