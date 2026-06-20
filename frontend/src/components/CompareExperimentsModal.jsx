import React, { useState, useEffect } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Typography, Box, Alert, CircularProgress
} from '@mui/material'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'
import { experimentApi } from '../services/api'

const COLORS = ['#1976d2', '#dc004e', '#388e3c', '#f57c00', '#7b1fa2', '#00796b', '#c62828', '#4527a0', '#ef6c00', '#2e7d32']

export default function CompareExperimentsModal({ open, experimentIds, onClose }) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    if (open && experimentIds.length >= 2) {
      loadComparison()
    }
  }, [open, experimentIds])

  const loadComparison = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await experimentApi.compare(experimentIds)
      setData(res.data.comparison || [])
    } catch (e) {
      setError('加载对比数据失败')
    } finally {
      setLoading(false)
    }
  }

  const allRounds = [...new Set(data.flatMap(d => d.rounds.map(r => r.round_num)))].sort((a, b) => a - b)

  const chartData = allRounds.map(round => {
    const row = { round }
    data.forEach((exp, idx) => {
      const found = exp.rounds.find(r => r.round_num === round)
      if (found && found.accuracy !== null) {
        row[`exp_${exp.experiment.id}`] = parseFloat((found.accuracy * 100).toFixed(2))
      }
    })
    return row
  })

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>实验对比分析 ({experimentIds.length} 个实验)</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {!loading && data.length > 0 && (
          <Box>
            <Box sx={{ mb: 3, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {data.map((d, idx) => (
                <Box key={d.experiment.id} sx={{
                  p: 2, border: 1, borderColor: 'divider', borderRadius: 2, minWidth: 240
                }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', backgroundColor: COLORS[idx], marginRight: 8, verticalAlign: 'middle' }} />
                    {d.experiment.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {d.experiment.config.dataset} / {d.experiment.config.model} / {d.experiment.config.algorithm}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    非IID: <strong>{d.experiment.config.non_iid_mode}</strong>
                    {d.experiment.config.non_iid_mode !== 'iid' && ` (α=${d.experiment.config.non_iid_alpha})`}
                  </Typography>
                  <Typography variant="body2">
                    安全聚合: <strong>{d.experiment.config.secure_agg ? '✓' : '✗'}</strong>,
                    DP: <strong>{d.experiment.config.dp ? '✓' : '✗'}</strong>
                  </Typography>
                  {d.experiment.config.byzantine > 0 && (
                    <Typography variant="body2">
                      拜占庭: <strong>x{d.experiment.config.byzantine}</strong>,
                      防御: <strong>{d.experiment.config.robust_agg}</strong>
                    </Typography>
                  )}
                  <Typography variant="h6" sx={{ mt: 1, color: 'success.main', fontWeight: 700 }}>
                    最终精度: {d.experiment.final_accuracy ? `${(d.experiment.final_accuracy * 100).toFixed(2)}%` : '-'}
                  </Typography>
                </Box>
              ))}
            </Box>

            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>精度曲线对比</Typography>
            <Box sx={{ height: 400 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="round"
                    label={{ value: '通信轮次', position: 'insideBottom', offset: -5 }}
                    tick={{ fontSize: 12 }} allowDecimals={false} />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`}
                    label={{ value: '精度 (%)', angle: -90, position: 'insideLeft' }}
                    tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value) => [`${value}%`]} labelFormatter={(l) => `第 ${l} 轮`} />
                  <Legend />
                  {data.map((d, idx) => (
                    <Line
                      key={d.experiment.id}
                      type="monotone"
                      dataKey={`exp_${d.experiment.id}`}
                      name={d.experiment.name}
                      stroke={COLORS[idx % COLORS.length]}
                      strokeWidth={2.5}
                      dot={{ r: 2 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Box>
          </Box>
        )}

        {!loading && data.length === 0 && !error && (
          <Alert severity="info">暂无对比数据</Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  )
}
