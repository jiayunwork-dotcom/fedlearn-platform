import React, { useMemo } from 'react'
import { Typography, Box } from '@mui/material'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  Cell
} from 'recharts'

const CLASS_COLORS = [
  '#1976d2', '#dc004e', '#388e3c', '#f57c00', '#7b1fa2',
  '#00796b', '#c62828', '#4527a0', '#ef6c00', '#2e7d32',
  '#00838f', '#ad1457', '#ef6c00', '#1565c0', '#2e7d32',
  '#6a1b9a', '#c62828', '#00695c', '#bf360c', '#4527a0'
]

function StackedBarChart({ distributionMatrix }) {
  const numClients = distributionMatrix.length
  const numClasses = distributionMatrix[0]?.length || 0

  const data = useMemo(() => {
    return Array.from({ length: numClients }, (_, i) => {
      const row = { client: `客户端 ${i + 1}` }
      for (let c = 0; c < numClasses; c++) {
        row[`class_${c}`] = distributionMatrix[i][c]
      }
      return row
    })
  }, [distributionMatrix, numClients, numClasses])

  const customTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const clientName = payload[0]?.payload?.client
      return (
        <div style={{
          backgroundColor: 'white',
          border: '1px solid #e0e0e0',
          borderRadius: 4,
          padding: 10,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <p style={{ fontWeight: 600, margin: '0 0 8px 0' }}>{clientName}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ margin: '2px 0', fontSize: 12, color: '#666' }}>
              <span style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                backgroundColor: entry.color,
                marginRight: 6,
                borderRadius: 2
              }} />
              类别 {entry.dataKey.replace('class_', '')}: {entry.value} 样本
            </p>
          ))}
          <p style={{ fontWeight: 600, margin: '8px 0 0 0', borderTop: '1px solid #eee', paddingTop: 6 }}>
            总计: {payload.reduce((sum, p) => sum + p.value, 0)} 样本
          </p>
        </div>
      )
    }
    return null
  }

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
        各客户端样本分布（堆叠柱状图）
      </Typography>
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="client" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip content={customTooltip} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {Array.from({ length: numClasses }, (_, c) => (
            <Bar
              key={`class_${c}`}
              dataKey={`class_${c}`}
              stackId="a"
              name={`类别 ${c}`}
              fill={CLASS_COLORS[c % CLASS_COLORS.length]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </Box>
  )
}

function HeatmapChart({ distributionMatrix }) {
  const numClients = distributionMatrix.length
  const numClasses = distributionMatrix[0]?.length || 0

  const { ratioMatrix, maxRatio } = useMemo(() => {
    const matrix = []
    let max = 0
    for (let i = 0; i < numClients; i++) {
      const row = []
      const total = distributionMatrix[i].reduce((sum, val) => sum + val, 0)
      for (let c = 0; c < numClasses; c++) {
        const ratio = total > 0 ? distributionMatrix[i][c] / total : 0
        row.push(ratio)
        if (ratio > max) max = ratio
      }
      matrix.push(row)
    }
    return { ratioMatrix: matrix, maxRatio: max }
  }, [distributionMatrix, numClients, numClasses])

  const getColor = (ratio) => {
    const intensity = maxRatio > 0 ? ratio / maxRatio : 0
    const r = Math.round(25 + (1 - intensity) * 230)
    const g = Math.round(118 + (1 - intensity) * 137)
    const b = Math.round(210 + (1 - intensity) * 45)
    return `rgb(${r}, ${g}, ${b})`
  }

  const getTextColor = (ratio) => {
    const intensity = maxRatio > 0 ? ratio / maxRatio : 0
    return intensity > 0.5 ? 'white' : '#333'
  }

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
        类别分布热力图（比例）
      </Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 400 }}>
          <thead>
            <tr>
              <th style={{
                padding: '8px 12px',
                fontSize: 12,
                fontWeight: 600,
                textAlign: 'left',
                borderBottom: '2px solid #e0e0e0',
                backgroundColor: '#fafafa',
                minWidth: 80
              }}>
                客户端 \ 类别
              </th>
              {Array.from({ length: numClasses }, (_, c) => (
                <th key={c} style={{
                  padding: '8px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  textAlign: 'center',
                  borderBottom: '2px solid #e0e0e0',
                  backgroundColor: '#fafafa',
                  minWidth: 50
                }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: numClients }, (_, i) => (
              <tr key={i}>
                <td style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 500,
                  borderBottom: '1px solid #f0f0f0',
                  backgroundColor: '#fafafa'
                }}>
                  客户端 {i + 1}
                </td>
                {Array.from({ length: numClasses }, (_, c) => {
                  const ratio = ratioMatrix[i]?.[c] || 0
                  const count = distributionMatrix[i]?.[c] || 0
                  return (
                    <td
                      key={c}
                      title={`类别 ${c}: ${count} 样本 (${(ratio * 100).toFixed(1)}%)`}
                      style={{
                        padding: '8px 12px',
                        fontSize: 11,
                        textAlign: 'center',
                        backgroundColor: getColor(ratio),
                        color: getTextColor(ratio),
                        borderBottom: '1px solid #f0f0f0',
                        cursor: 'default',
                        fontWeight: 500,
                        transition: 'all 0.2s'
                      }}
                    >
                      {(ratio * 100).toFixed(0)}%
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', mt: 2, gap: 1 }}>
        <Typography variant="caption" color="text.secondary">低</Typography>
        <Box sx={{
          width: 120,
          height: 12,
          borderRadius: 2,
          background: 'linear-gradient(to right, rgb(255,255,255), #1976d2)'
        }} />
        <Typography variant="caption" color="text.secondary">高</Typography>
      </Box>
    </Box>
  )
}

export default function PartitionCharts({ distributionMatrix }) {
  if (!distributionMatrix || !distributionMatrix.length) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          暂无分片数据
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <StackedBarChart distributionMatrix={distributionMatrix} />
      <HeatmapChart distributionMatrix={distributionMatrix} />
    </Box>
  )
}
