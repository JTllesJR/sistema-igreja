/** Tokens de injeção das portas (interfaces não existem em execução; o Nest precisa de um identificador). */
export const USER_REPOSITORY = Symbol('UserRepository');
export const ROLE_REPOSITORY = Symbol('RoleRepository');
export const SESSION_REPOSITORY = Symbol('SessionRepository');
export const PASSWORD_HASHER = Symbol('PasswordHasher');
export const ACCESS_TOKEN_SIGNER = Symbol('AccessTokenSigner');
export const ACCESS_TOKEN_VERIFIER = Symbol('AccessTokenVerifier');
export const REFRESH_TOKEN_CODEC = Symbol('RefreshTokenCodec');
export const ORGANIZATION_DIRECTORY = Symbol('OrganizationDirectory');
export const CLOCK = Symbol('Clock');
export const ID_GENERATOR = Symbol('IdGenerator');
export const SESSION_POLICY = Symbol('SessionPolicy');
export const TEMPORARY_PASSWORD_GENERATOR = Symbol(
  'TemporaryPasswordGenerator',
);
/** As permissões que existem no sistema (`PermissionDefinition[]`), montadas na raiz a partir de cada módulo (ADR 0019). */
export const PERMISSION_CATALOG = Symbol('PermissionCatalog');
