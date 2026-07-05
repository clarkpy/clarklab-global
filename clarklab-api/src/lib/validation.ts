import { z } from 'zod'

export const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
})

export const signupSchema = z.object({
  username: z.string().trim().min(2).max(64),
  password: z.string().min(8),
  accessCode: z.string().min(1),
  email: z.union([z.literal(''), z.string().email()]).optional().default(''),
})

export const updateAccountSchema = z
  .object({
    email: z.union([z.literal(''), z.string().email()]).optional(),
    currentPassword: z.string().min(1).optional(),
    newPassword: z.string().min(8).optional(),
  })
  .superRefine((body, ctx) => {
    if (body.newPassword && !body.currentPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Current password is required to set a new password',
        path: ['currentPassword'],
      })
    }
    if (body.email !== undefined && !body.currentPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Current password is required to change email',
        path: ['currentPassword'],
      })
    }
    if (body.email === undefined && body.newPassword === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'No account changes requested',
        path: ['email'],
      })
    }
  })

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(64),
  description: z.string().max(500).optional().default(''),
  environments: z.array(z.string()).optional(),
})

export const createServiceSchema = z.object({
  name: z.string().trim().min(1).max(64),
  projectId: z.string().uuid(),
  type: z.string().min(1),
  port: z.number().int().min(0),
  url: z.string().optional(),
  subdomain: z.string().max(63).optional(),
  hostname: z.string().max(253).optional(),
  nodeId: z.string().uuid(),
  environment: z.enum(['development', 'production']).optional(),
  image: z.string().optional(),
  sourceType: z.string().optional(),
  templateId: z.string().optional(),
  repository: z.string().optional(),
  branch: z.string().optional(),
  rootDirectory: z.string().optional(),
  startCommand: z.string().optional(),
  buildCommand: z.string().optional(),
  installCommand: z.string().optional(),
  healthCheck: z.string().max(512).optional(),
  storage: z
    .object({
      enabled: z.boolean().optional(),
      mountPath: z.string().optional(),
      sizeGb: z.number().optional(),
    })
    .optional(),
  envVars: z
    .array(
      z.object({
        key: z.string(),
        value: z.string(),
        isSecret: z.boolean().optional(),
      }),
    )
    .optional(),
})

export const deployServiceSchema = z.object({
  commitSha: z.string().optional(),
  env: z.enum(['development', 'production']).optional(),
})

export const updateServiceSettingsSchema = z.object({
  env: z.enum(['development', 'production']).optional(),
  nodeId: z.string().uuid().optional(),
  port: z.number().int().min(0).max(65535).optional(),
  url: z.string().max(2048).optional(),
  subdomain: z.string().max(63).optional(),
  hostname: z.string().max(253).optional(),
  clearHostname: z.boolean().optional(),
  image: z.string().max(256).optional(),
  repository: z.string().optional(),
  branch: z.string().trim().min(1).max(256).optional(),
  rootDirectory: z.string().trim().max(256).optional(),
  startCommand: z.string().max(512).optional(),
  buildCommand: z.string().max(512).optional(),
  installCommand: z.string().max(512).optional(),
  healthCheck: z.string().max(512).optional(),
  storage: z
    .object({
      enabled: z.boolean().optional(),
      mountPath: z.string().max(256).optional(),
      sizeGb: z.number().min(0).max(10000).optional(),
    })
    .optional(),
  restart: z
    .object({
      autoRestart: z.boolean().optional(),
      policy: z.enum(['unless-stopped', 'on-failure', 'always']).optional(),
      maxRestarts: z.number().int().min(0).max(20).optional(),
      windowSeconds: z.number().int().min(60).max(3600).optional(),
    })
    .optional(),
})

export const serviceEnvSchema = z.object({
  env: z.enum(['development', 'production']).optional(),
})

export const copyServiceEnvironmentSchema = z.object({
  source: z.enum(['development', 'production']),
})

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
})

export const adminUpdateUserSchema = z.object({
  username: z.string().trim().min(2).max(64).optional(),
  email: z.union([z.literal(''), z.string().email()]).optional(),
  role: z.enum(['user', 'sysadmin']).optional(),
  locked: z.boolean().optional(),
  lockedReason: z.string().max(500).optional(),
  newPassword: z.string().min(8).optional(),
})

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  return schema.parse(body)
}