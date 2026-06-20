import React from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts'

export default function LossChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
        <XAxis
          dataKey="round"
          label={{ value: '通信轮次', position: 'insideBottom', offset: -5 }}
          tick={{ fontSize: 12 }}
        />
        <YAxis
          label={{ value: '损失值', angle: -90, position: 'insideLeft' }}
          tick={{ fontSize: 12 }}
        />
        <Tooltip
          formatter={(value) => [value.toFixed(4), '损失']}
          labelFormatter={(l) => `第 ${l} 轮`}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="value"
          name="全局损失"
          stroke="#dc004e"
          strokeWidth={2.5}
          dot={{ r: 3 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
