import React from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ZAxis, Cell
} from 'recharts'

function computeStats(arr) {
  if (!arr || arr.length === 0) return null
  const sorted = [...arr].sort((a, b) => a - b)
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const median = sorted[Math.floor(sorted.length / 2)]
  const q1 = sorted[Math.floor(sorted.length * 0.25)]
  const q3 = sorted[Math.floor(sorted.length * 0.75)]
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length
  return { min, q1, median, mean, q3, max }
}

export default function ClientAccuracyBoxplot({ roundsData }) {
  const scatterData = []
  roundsData.forEach(round => {
    round.accuracies.forEach((acc, idx) => {
      scatterData.push({
        round: round.round,
        accuracy: acc,
        size: 50,
        client: idx
      })
    })
  })

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
        <XAxis
          type="number"
          dataKey="round"
          name="轮次"
          label={{ value: '通信轮次', position: 'insideBottom', offset: -5 }}
          tick={{ fontSize: 12 }}
          domain={['dataMin', 'dataMax']}
          allowDecimals={false}
        />
        <YAxis
          type="number"
          dataKey="accuracy"
          name="精度"
          label={{ value: '客户端精度 (%)', angle: -90, position: 'insideLeft' }}
          tick={{ fontSize: 12 }}
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
        />
        <ZAxis type="number" range={[20, 200]} dataKey="size" />
        <Tooltip
          formatter={(value, name, props) => {
            if (name === '精度') return [`${value.toFixed(2)}%`, `客户端 ${props.payload.client + 1}`]
            return [value, name]
          }}
          labelFormatter={(l) => `第 ${l} 轮`}
        />
        <Scatter name="客户端精度" data={scatterData} fill="#1976d2">
          {scatterData.map((entry, index) => (
            <Cell key={`cell-${index}`} fillOpacity={0.6} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  )
}
