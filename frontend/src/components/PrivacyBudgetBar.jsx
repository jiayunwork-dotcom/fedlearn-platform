import React from 'react'
import { Box, LinearProgress, Typography, Stack } from '@mui/material'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

export default function PrivacyBudgetBar({ current, target, history = [] }) {
  const percentage = Math.min(100, (current / target) * 100)
  const isExceeded = current > target

  let cumulative = 0
  const historyData = history.map((h, i) => {
    cumulative += h
    return { round: i + 1, epsilon: parseFloat(cumulative.toFixed(4)) }
  })

  return (
    <Stack spacing={3}>
      <Box>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="body2">
            当前隐私预算: <strong style={{ color: isExceeded ? 'error.main' : 'primary.main', fontSize: 18 }}>
              {current.toFixed(3)} ε
            </strong>
          </Typography>
          <Typography variant="body2" color="text.secondary">
            上限: {target} ε
          </Typography>
        </Stack>
        <LinearProgress
          variant="determinate"
          value={percentage}
          color={isExceeded ? 'error' : percentage > 80 ? 'warning' : 'primary'}
          sx={{ height: 14, borderRadius: 7 }}
        />
        <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            已消耗 {percentage.toFixed(1)}%
          </Typography>
          <Typography variant="caption" color="text.secondary">
            剩余 {Math.max(0, (target - current)).toFixed(3)} ε
          </Typography>
        </Stack>
      </Box>

      {historyData.length > 0 && (
        <Box sx={{ height: 120 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={historyData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" tick={{ fontSize: 10 }} allowDecimals={false} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(value) => [`${value} ε`, '累计隐私消耗']}
                labelFormatter={(l) => `第 ${l} 轮`}
              />
              <Area
                type="monotone"
                dataKey="epsilon"
                stroke={isExceeded ? '#f44336' : '#1976d2'}
                fill={isExceeded ? '#fce4ec' : '#e3f2fd'}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Stack>
  )
}
