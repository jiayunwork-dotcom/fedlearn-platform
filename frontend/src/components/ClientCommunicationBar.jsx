import React, { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell
} from 'recharts'

export default function ClientCommunicationBar({ clientStats = [], numClients = 0 }) {
  const chartData = useMemo(() => {
    return clientStats.map(client => ({
      client: `Client ${client.client_id}`,
      client_id: client.client_id,
      bytes: client.total_communication || 0,
      KB: parseFloat(((client.total_communication || 0) / 1024).toFixed(2)),
      MB: parseFloat(((client.total_communication || 0) / 1024 / 1024).toFixed(3)),
      is_byzantine: client.is_byzantine,
      status: client.status
    }))
  }, [clientStats])

  const totalComm = useMemo(() => {
    return clientStats.reduce((sum, c) => sum + (c.total_communication || 0), 0)
  }, [clientStats])

  const maxComm = useMemo(() => {
    return Math.max(...clientStats.map(c => c.total_communication || 0), 1)
  }, [clientStats])

  if (numClients === 0) {
    return null
  }

  const getBarColor = (entry) => {
    if (entry.is_byzantine) {
      return '#ef5350'
    }
    return '#1976d2'
  }

  const formatBytes = (bytes) => {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / 1024 / 1024).toFixed(2)} MB`
    } else if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(2)} KB`
    } else {
      return `${bytes} B`
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{
          padding: '12px 20px',
          backgroundColor: '#e3f2fd',
          borderRadius: 8,
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1976d2' }}>
            {formatBytes(totalComm)}
          </div>
          <div style={{ fontSize: 12, color: '#666' }}>总通信量</div>
        </div>
        <div style={{
          padding: '12px 20px',
          backgroundColor: '#f3e5f5',
          borderRadius: 8,
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#7b1fa2' }}>
            {numClients}
          </div>
          <div style={{ fontSize: 12, color: '#666' }}>客户端数量</div>
        </div>
        <div style={{
          padding: '12px 20px',
          backgroundColor: '#e8f5e9',
          borderRadius: 8,
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#388e3c' }}>
            {formatBytes(totalComm / Math.max(numClients, 1))}
          </div>
          <div style={{ fontSize: 12, color: '#666' }}>平均每客户端</div>
        </div>
      </div>

      <div style={{ height: Math.max(300, numClients * 30), minHeight: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis
              type="number"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => {
                if (v >= 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1)}MB`
                if (v >= 1024) return `${(v / 1024).toFixed(0)}KB`
                return `${v}B`
              }}
              label={{ value: '通信量 (字节)', position: 'insideBottom', offset: -5 }}
            />
            <YAxis
              type="category"
              dataKey="client"
              tick={{ fontSize: 11 }}
              width={70}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload
                  return (
                    <div style={{
                      backgroundColor: 'white',
                      padding: '8px 12px',
                      border: '1px solid #e0e0e0',
                      borderRadius: 4,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        {data.client}
                      </div>
                      <div style={{ fontSize: 12, color: '#666' }}>
                        通信量: {formatBytes(data.bytes)}
                      </div>
                      <div style={{ fontSize: 12, color: '#666' }}>
                        状态: {({
                          training: '训练中',
                          idle: '空闲',
                          offline: '掉线',
                          malicious: '被标记为恶意'
                        })[data.status] || data.status}
                      </div>
                    </div>
                  )
                }
                return null
              }}
            />
            <Bar
              dataKey="bytes"
              name="累计通信量"
              radius={[0, 4, 4, 0]}
              animationDuration={800}
              animationEasing="ease-out"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{
        display: 'flex',
        gap: 16,
        marginTop: 12,
        justifyContent: 'center',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 12,
            height: 12,
            backgroundColor: '#1976d2',
            borderRadius: 2
          }} />
          <span style={{ fontSize: 12, color: '#666' }}>正常客户端</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 12,
            height: 12,
            backgroundColor: '#ef5350',
            borderRadius: 2
          }} />
          <span style={{ fontSize: 12, color: '#666' }}>拜占庭客户端</span>
        </div>
      </div>
    </div>
  )
}
