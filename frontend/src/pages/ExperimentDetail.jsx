import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box, Paper, Typography, Grid, Chip, LinearProgress,
  Stack, Button, IconButton, Tooltip, Divider, Card, CardContent,
  Alert
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import RefreshIcon from '@mui/icons-material/Refresh'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { experimentApi } from '../services/api'
import { createWebSocket } from '../services/websocket'
import AccuracyChart from '../components/AccuracyChart.jsx'
import LossChart from '../components/LossChart.jsx'
import ClientAccuracyBoxplot from '../components/ClientAccuracyBoxplot.jsx'
import PrivacyBudgetBar from '../components/PrivacyBudgetBar.jsx'
import DataDistributionChart from '../components/DataDistributionChart.jsx'
import ByzantineDetectionChart from '../components/ByzantineDetectionChart.jsx'
import CommunicationStats from '../components/CommunicationStats.jsx'

const STATUS_TEXT = {
  pending: '待启动', queued: '排队中', running: '运行中',
  completed: '已完成', stopped: '已停止', error: '错误', privacy_exceeded: '隐私超限'
}
const STATUS_COLORS = {
  pending: 'default', queued: 'info', running: 'primary',
  completed: 'success', stopped: 'warning', error: 'error', privacy_exceeded: 'warning'
}

export default function ExperimentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const experimentId = parseInt(id)

  const [experiment, setExperiment] = useState(null)
  const [rounds, setRounds] = useState([])
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState([])
  const logsEndRef = useRef(null)
  const wsRef = useRef(null)
  const [error, setError] = useState(null)

  const loadData = async () => {
    try {
      setLoading(true)
      const [expRes, roundsRes] = await Promise.all([
        experimentApi.get(experimentId),
        experimentApi.getRounds(experimentId)
      ])
      setExperiment(expRes.data)
      setRounds(roundsRes.data.rounds)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    const ws = createWebSocket(experimentId, {
      onProgress: (data) => {},
      onRoundComplete: (data) => {
        loadData()
      },
      onCompleted: (data) => {
        loadData()
      },
      onError: (data) => {
        loadData()
      },
      onLog: (data) => {
        setLogs(prev => [...prev.slice(-99), data])
      },
      onMessage: (data) => {
        if (data.type === 'round_complete' || data.type === 'progress') {
          loadData()
        }
        if (data.type === 'log') {
          setLogs(prev => [...prev.slice(-99), data])
        }
      }
    })
    wsRef.current = ws

    const interval = setInterval(() => {
      if (experiment && ['running', 'queued'].includes(experiment.status)) {
        loadData()
      }
    }, 3000)

    return () => {
      ws.close()
      clearInterval(interval)
    }
  }, [experimentId])

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

  const handleStart = async () => {
    try {
      await experimentApi.start(experimentId)
      loadData()
    } catch (e) {
      alert(e.response?.data?.detail || '启动失败')
    }
  }

  const handleStop = async () => {
    try {
      await experimentApi.stop(experimentId)
      loadData()
    } catch (e) {
      alert(e.response?.data?.detail || '停止失败')
    }
  }

  if (loading && !experiment) {
    return <LinearProgress />
  }

  if (error && !experiment) {
    return (
      <Alert severity="error">
        加载失败: {error}
        <Button onClick={loadData} sx={{ ml: 2 }}>重试</Button>
      </Alert>
    )
  }

  if (!experiment) return null

  const accuracyData = rounds.map(r => ({ round: r.round_num, value: r.global_accuracy * 100 }))
  const lossData = rounds.map(r => ({ round: r.round_num, value: r.global_loss }))

  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
          <IconButton onClick={() => navigate('/')}>
            <ArrowBackIcon />
          </IconButton>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {experiment.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              实验 #{experiment.id}
            </Typography>
          </Box>
          <Chip
            label={STATUS_TEXT[experiment.status] || experiment.status}
            color={STATUS_COLORS[experiment.status] || 'default'}
          />
          <Tooltip title="刷新">
            <IconButton onClick={loadData}><RefreshIcon /></IconButton>
          </Tooltip>
          {(experiment.status === 'pending' || experiment.status === 'stopped' || experiment.status === 'error' || experiment.status === 'completed') && (
            <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={handleStart}>
              开始
            </Button>
          )}
          {(experiment.status === 'running' || experiment.status === 'queued') && (
            <Button variant="contained" color="warning" startIcon={<StopIcon />} onClick={handleStop}>
              停止
            </Button>
          )}
        </Stack>

        {experiment.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {experiment.description}
          </Typography>
        )}

        <Divider sx={{ my: 2 }} />

        <Grid container spacing={3}>
          <Grid item xs={6} sm={3}>
            <Typography variant="caption" color="text.secondary">算法</Typography>
            <Typography variant="body1" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
              {experiment.algorithm}
            </Typography>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Typography variant="caption" color="text.secondary">数据集 / 模型</Typography>
            <Typography variant="body1" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
              {experiment.dataset_name} / {experiment.model_name}
            </Typography>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Typography variant="caption" color="text.secondary">客户端数 / 轮次</Typography>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {experiment.num_clients} / {experiment.num_rounds}
            </Typography>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Typography variant="caption" color="text.secondary">本地 Epochs</Typography>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {experiment.local_epochs}
            </Typography>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Typography variant="caption" color="text.secondary">最终精度</Typography>
            <Typography variant="body1" sx={{ fontWeight: 700, color: experiment.final_accuracy ? 'success.main' : 'inherit' }}>
              {experiment.final_accuracy ? `${(experiment.final_accuracy * 100).toFixed(2)}%` : '-'}
            </Typography>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Typography variant="caption" color="text.secondary">当前进度</Typography>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {rounds.length} / {experiment.num_rounds} 轮
            </Typography>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Typography variant="caption" color="text.secondary">总通信量</Typography>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {((experiment.total_communication || 0) / 1024 / 1024).toFixed(2)} MB
            </Typography>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Typography variant="caption" color="text.secondary">创建时间</Typography>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {experiment.created_at ? format(new Date(experiment.created_at), 'MM-dd HH:mm', { locale: zhCN }) : '-'}
            </Typography>
          </Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />

        <Stack direction="row" spacing={1} flexWrap="wrap">
          {experiment.secure_aggregation && (
            <Chip label={`安全聚合 (t=${experiment.secagg_threshold})`} color="primary" size="small" />
          )}
          {experiment.differential_privacy && (
            <Chip label={`差分隐私 (ε=${experiment.dp_target_epsilon})`} color="secondary" size="small" />
          )}
          {experiment.non_iid_mode !== 'iid' && (
            <Chip label={`非IID ${experiment.non_iid_mode} (α=${experiment.non_iid_alpha})`} color="warning" size="small" />
          )}
          {experiment.num_byzantine > 0 && (
            <Chip label={`拜占庭攻击 x${experiment.num_byzantine}`} color="error" size="small" />
          )}
          {experiment.robust_aggregation !== 'none' && (
            <Chip label={`鲁棒聚合: ${experiment.robust_aggregation}`} color="info" size="small" />
          )}
          {experiment.algorithm === 'fedprox' && (
            <Chip label={`FedProx μ=${experiment.fedprox_mu}`} size="small" />
          )}
        </Stack>
      </Paper>

      <Grid container spacing={3}>
        {experiment.differential_privacy && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>隐私预算</Typography>
                <PrivacyBudgetBar
                  current={experiment.current_epsilon || 0}
                  target={experiment.dp_target_epsilon}
                  history={rounds.map(r => r.epsilon_consumed)}
                />
              </CardContent>
            </Card>
          </Grid>
        )}

        <Grid item xs={12} lg={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>全局精度曲线</Typography>
              <div className="chart-container" style={{ minHeight: 300 }}>
                <AccuracyChart data={accuracyData} />
              </div>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>全局损失曲线</Typography>
              <div className="chart-container" style={{ minHeight: 300 }}>
                <LossChart data={lossData} />
              </div>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>客户端本地精度分布</Typography>
              <div className="chart-container" style={{ minHeight: 300 }}>
                <ClientAccuracyBoxplot
                  roundsData={rounds.filter(r => r.client_accuracies).map(r => ({
                    round: r.round_num,
                    accuracies: r.client_accuracies.map(a => a * 100)
                  }))}
                />
              </div>
            </CardContent>
          </Card>
        </Grid>

        {experiment.num_byzantine > 0 && (
          <Grid item xs={12} lg={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>拜占庭攻击检测</Typography>
                <div className="chart-container" style={{ minHeight: 300 }}>
                  <ByzantineDetectionChart
                    rounds={rounds.map(r => ({
                      round: r.round_num,
                      detected: r.byzantine_detected_count,
                      total: r.byzantine_total_count
                    }))}
                  />
                </div>
              </CardContent>
            </Card>
          </Grid>
        )}

        {experiment.client_distribution && (
          <Grid item xs={12} lg={experiment.num_byzantine > 0 ? 12 : 6}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>客户端数据分布</Typography>
                <div className="chart-container" style={{ minHeight: 280 }}>
                  <DataDistributionChart distribution={experiment.client_distribution} />
                </div>
              </CardContent>
            </Card>
          </Grid>
        )}

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>通信统计</Typography>
              <CommunicationStats
                rounds={rounds.map(r => ({
                  round: r.round_num,
                  bytes: r.communication_bytes,
                  participants: r.num_participants
                }))}
                totalClients={experiment.num_clients}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>训练日志</Typography>
              <Box
                sx={{
                  height: 240,
                  overflow: 'auto',
                  backgroundColor: '#1e1e1e',
                  color: '#d4d4d4',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  p: 2,
                  borderRadius: 1
                }}
              >
                {logs.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">暂无日志</Typography>
                ) : (
                  logs.map((log, i) => (
                    <Box key={i} sx={{ mb: 0.5 }}>
                      <span style={{ color: log.level === 'error' ? '#f48771' : log.level === 'warning' ? '#dcdcaa' : '#8cdcfe' }}>
                        [{log.level?.toUpperCase() || 'INFO'}]
                      </span>{' '}
                      <span>[Round {log.round || '-'}]</span>{' '}
                      {log.message}
                    </Box>
                  ))
                )}
                <div ref={logsEndRef} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
