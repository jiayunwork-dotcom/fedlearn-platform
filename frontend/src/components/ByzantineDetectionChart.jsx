import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LineChart, Line
} from 'recharts'

export default function ByzantineDetectionChart({ rounds }) {
  const data = rounds.map(r => ({
    round: r.round,
    检测到: r.detected,
    总数: r.total,
    检测率: r.total > 0 ? parseFloat(((r.detected / r.total) * 100).toFixed(1)) : 0
  }))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
        <XAxis dataKey="round" tick={{ fontSize: 12 }} allowDecimals={false}
          label={{ value: '通信轮次', position: 'insideBottom', offset: -5 }} />
        <YAxis yAxisId="left" tick={{ fontSize: 12 }}
          label={{ value: '恶意客户端数', angle: -90, position: 'insideLeft' }} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          label={{ value: '检测率 (%)', angle: 90, position: 'insideRight' }} />
        <Tooltip />
        <Legend />
        <Bar yAxisId="left" dataKey="总数" name="恶意总数" fill="#9e9e9e" radius={[4, 4, 0, 0]} />
        <Bar yAxisId="left" dataKey="检测到" name="成功检测" fill="#f44336" radius={[4, 4, 0, 0]} />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="检测率"
          name="检测率"
          stroke="#1976d2"
          strokeWidth={2.5}
          dot={{ r: 3 }}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
