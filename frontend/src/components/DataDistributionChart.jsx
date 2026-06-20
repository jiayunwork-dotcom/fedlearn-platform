import React from 'react'
import { Typography } from '@mui/material'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

export default function DataDistributionChart({ distribution }) {
  if (!distribution) return null

  const { client_data_counts, client_label_dist } = distribution
  if (!client_data_counts) return null

  const countData = Object.entries(client_data_counts).map(([id, count]) => ({
    client: `C${parseInt(id) + 1}`,
    samples: count
  }))

  const colors = ['#1976d2', '#dc004e', '#388e3c', '#f57c00', '#7b1fa2', '#00796b', '#c62828', '#4527a0', '#ef6c00', '#2e7d32']

  let labelData = []
  if (client_label_dist) {
    const labelEntries = Object.entries(client_label_dist)
    if (labelEntries.length > 0) {
      const numLabels = labelEntries[0][1].length
      const seriesKeys = Array.from({ length: numLabels }, (_, i) => `label_${i}`)

      labelData = labelEntries.map(([id, dist]) => {
        const row = { client: `C${parseInt(id) + 1}` }
        dist.forEach((val, i) => {
          row[`label_${i}`] = parseFloat((val * 100).toFixed(1))
        })
        return row
      })
    }

    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, width: '100%' }}>
        <div className="chart-container" style={{ minHeight: 250 }}>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>各客户端样本数量</Typography>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={countData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="client" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [v, '样本数']} />
              <Bar dataKey="samples" fill="#1976d2" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {labelData.length > 0 && (
          <div className="chart-container" style={{ minHeight: 250 }}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>各客户端标签分布 (%)</Typography>
            <ResponsiveContainer width="100%" height="90%">
              <BarChart data={labelData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="client" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v) => [`${v}%`]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {Array.from({ length: labelData[0] ? Object.keys(labelData[0]).length - 1 : 0 }, (_, i) => (
                  <Bar
                    key={`label_${i}`}
                    dataKey={`label_${i}`}
                    stackId="a"
                    name={`类 ${i}`}
                    fill={colors[i % colors.length]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    )
  }

  return null
}
