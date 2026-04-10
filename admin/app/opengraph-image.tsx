import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'QueryPanel - Agent Runtime for Data-Driven Copilots'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            color: 'white',
            padding: '40px',
          }}
        >
          <h1
            style={{
              fontSize: '72px',
              fontWeight: 'bold',
              marginBottom: '20px',
              background: 'linear-gradient(90deg, #ffffff 0%, #e0e7ff 100%)',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            QueryPanel
          </h1>
          <p
            style={{
              fontSize: '36px',
              marginBottom: '30px',
              opacity: 0.9,
            }}
          >
            Agent Runtime for Data-Driven Copilots
          </p>
          <div
            style={{
              display: 'flex',
              gap: '20px',
              fontSize: '24px',
              opacity: 0.8,
            }}
          >
            <span>🔒 Zero Credential Exposure</span>
            <span>🏢 Multi-Tenant Safe</span>
            <span>⚡ PostgreSQL & ClickHouse</span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}