import React from 'react'
import { Grid, Paper, Typography, Box } from '@mui/material'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

export default function CommunicationStats({ rounds = [], totalClients = 10 }) {
  const commData = rounds.map(r => ({
    round: r.round,
    MB: parseFloat((r.bytes / 1024 / 1024).toFixed(3)),
    参与率: r.participants ? parseFloat(((r.participants / totalClients) * 100).toFixed(1)) : 0
  }))

  const totalMB = commData.reduce((sum, r) => sum + r.MB, 0)
  const avgParticipants = rounds.length > 0
    ? (rounds.reduce((sum, r) => sum + (r.participants || 0), 0) / rounds.length).toFixed(1)
    : 0

  return (
    <Grid container spacing={3}>
      <Grid item xs={12} sm={4}>
        <Paper sx={{ p: 2, textAlign: 'center' }}>
          <Typography variant="h5" color="primary.main" sx={{ fontWeight: 700 }}>
            {totalMB.toFixed(2)}
          </Typography>
          <Typography variant="caption" color="text.secondary">总通信量 (MB)</Typography>
        </Paper>
      </Grid>
      <Grid item xs={12} sm={4}>
        <Paper sx={{ p: 2, textAlign: 'center' }}>
          <Typography variant="h5" color="secondary.main" sx={{ fontWeight: 700 }}>
            {rounds.length > 0 ? rounds[rounds.length - 1].round : 0}
          </Typography>
          <Typography variant="caption" color="text.secondary">已完成轮次</Typography>
        </Paper>
      </Grid>
      <Grid item xs={12} sm={4}>
        <Paper sx={{ p: 2, textAlign: 'center' }}>
          <Typography variant="h5" color="success.main" sx={{ fontWeight: 700 }}>
            {avgParticipants} / {totalClients}
          </Typography>
          <Typography variant="caption" color="text.secondary">平均每轮参与客户端</Typography>
        </Paper>
      </Grid>

      <Grid item xs={12}>
        <Box sx={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={commData} margin={{ top: 5, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" tick={{ fontSize: 11 }} allowDecimals={false}
                label={{ value: '通信轮次', position: 'insideBottom', offset: -4 }} />
              <YAxis tick={{ fontSize: 11 }} label={{ value: '通信量 (MB)', angle: -90, position: 'insideLeft' }} />
              <Tooltip formatter={(v) => [`${v} MB`, '通信量']} labelFormatter={(l) => `第 ${l} 轮`} />
              <Area
                type="monotone"
                dataKey="MB"
                stroke="#1976d2"
                fill="#e3f2fd"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Box>
      </Grid>
    </Grid>
  )
}
