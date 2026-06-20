import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, FormControl, InputLabel, Select, MenuItem, Grid,
  Stack, Switch, FormControlLabel, Slider, Typography, Divider,
  Box, Chip, Alert, Tabs, Tab, Card, CardContent, CardActionArea
} from '@mui/material'
import { experimentApi } from '../services/api'

const ALGORITHMS = [
  { value: 'fedavg', label: 'FedAvg (联邦平均)' },
  { value: 'fedprox', label: 'FedProx (近端约束)' },
]

const DATASETS = [
  { value: 'mnist', label: 'MNIST (手写数字)' },
  { value: 'cifar10', label: 'CIFAR-10 (彩色图像)' },
]

const MODELS = [
  { value: 'mlp', label: 'MLP (两层全连接)' },
  { value: 'cnn', label: 'CNN (两层卷积)' },
  { value: 'resnet', label: 'ResNet (6层残差)' },
]

const NON_IID_MODES = [
  { value: 'iid', label: 'IID (独立同分布)' },
  { value: 'label_skew', label: 'Label Skew (标签偏斜)' },
  { value: 'quantity_skew', label: 'Quantity Skew (数量偏斜)' },
  { value: 'feature_skew', label: 'Feature Skew (特征偏斜)' },
]

const BYZANTINE_ATTACKS = [
  { value: 'random', label: '随机噪声' },
  { value: 'scale', label: '梯度放大10倍' },
  { value: 'zero', label: '全零更新' },
]

const ROBUST_AGGS = [
  { value: 'none', label: '不使用' },
  { value: 'krum', label: 'Krum' },
  { value: 'trimmed_mean', label: 'Trimmed Mean' },
  { value: 'median', label: 'Coordinate-wise Median' },
]

const DEFAULT_CONFIG = {
  name: `FedAvg实验_${new Date().toISOString().slice(0, 16).replace('T', '_')}`,
  description: '',
  num_clients: 10,
  num_rounds: 20,
  client_sample_rate: 1.0,
  local_epochs: 5,
  batch_size: 64,
  learning_rate: 0.01,
  algorithm: 'fedavg',
  fedprox_mu: 0.01,
  secure_aggregation: false,
  secagg_threshold: 8,
  secagg_dropout_rate: 0.1,
  differential_privacy: false,
  dp_clip_norm: 1.0,
  dp_noise_multiplier: 1.0,
  dp_target_epsilon: 5.0,
  dp_delta: 0.00001,
  non_iid_mode: 'iid',
  non_iid_alpha: 0.5,
  num_byzantine: 0,
  byzantine_attack: 'random',
  robust_aggregation: 'none',
  dataset_name: 'mnist',
  model_name: 'mlp',
}

const TEMPLATE_COLORS = ['#1976d2', '#7b1fa2', '#ed6c02', '#d32f2f', '#2e7d32']

export default function CreateExperimentModal({ open, onClose }) {
  const navigate = useNavigate()
  const [tabValue, setTabValue] = useState(0)
  const [templates, setTemplates] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState(null)
  const [config, setConfig] = useState({ ...DEFAULT_CONFIG })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (open) {
      experimentApi.getTemplates().then(res => {
        setTemplates(res.data)
      }).catch(() => {})
    }
  }, [open])

  const handleTabChange = (_, newValue) => {
    setTabValue(newValue)
    if (newValue === 0) {
      setSelectedTemplateId(null)
      setConfig({ ...DEFAULT_CONFIG, name: `FedAvg实验_${new Date().toISOString().slice(0, 16).replace('T', '_')}` })
    }
  }

  const handleSelectTemplate = (template) => {
    setSelectedTemplateId(template.id)
    const merged = {
      ...DEFAULT_CONFIG,
      ...template.config,
      description: template.description,
    }
    const numericFields = [
      'num_clients', 'num_rounds', 'local_epochs', 'batch_size',
      'learning_rate', 'client_sample_rate', 'fedprox_mu',
      'secagg_threshold', 'secagg_dropout_rate',
      'dp_clip_norm', 'dp_noise_multiplier', 'dp_target_epsilon', 'dp_delta',
      'non_iid_alpha', 'num_byzantine',
    ]
    const boolFields = [
      'secure_aggregation', 'differential_privacy',
    ]
    for (const key of numericFields) {
      if (merged[key] !== undefined) {
        merged[key] = Number(merged[key])
      }
    }
    for (const key of boolFields) {
      if (merged[key] !== undefined) {
        merged[key] = Boolean(merged[key])
      }
    }
    setConfig(merged)
  }

  const handleChange = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async () => {
    try {
      setSubmitting(true)
      setError(null)
      const res = await experimentApi.create(config)
      const expId = res.data.id

      if (config.non_iid_mode !== 'iid') {
        if (config.secagg_threshold >= config.num_clients) {
          handleChange('secagg_threshold', Math.max(2, config.num_clients - 1))
        }
      }

      await experimentApi.start(expId)
      onClose()
      navigate(`/experiment/${expId}`)
    } catch (e) {
      setError(e.response?.data?.detail || '创建实验失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!submitting) {
      setTabValue(0)
      setSelectedTemplateId(null)
      setConfig({ ...DEFAULT_CONFIG, name: `FedAvg实验_${new Date().toISOString().slice(0, 16).replace('T', '_')}` })
      setError(null)
      onClose()
    }
  }

  const renderConfigForm = () => (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <TextField
          fullWidth
          required
          label="实验名称"
          value={config.name}
          onChange={(e) => handleChange('name', e.target.value)}
        />
        <TextField
          fullWidth
          multiline
          rows={2}
          label="实验描述 (可选)"
          value={config.description}
          onChange={(e) => handleChange('description', e.target.value)}
          sx={{ mt: 2 }}
        />
      </Grid>

      <Grid item xs={12}>
        <Divider sx={{ my: 1 }}>
          <Chip label="数据集与模型" size="small" color="primary" variant="outlined" />
        </Divider>
      </Grid>

      <Grid item xs={12} sm={6}>
        <FormControl fullWidth>
          <InputLabel>数据集</InputLabel>
          <Select value={config.dataset_name} label="数据集" onChange={(e) => handleChange('dataset_name', e.target.value)}>
            {DATASETS.map(d => <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>)}
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12} sm={6}>
        <FormControl fullWidth>
          <InputLabel>模型</InputLabel>
          <Select value={config.model_name} label="模型" onChange={(e) => handleChange('model_name', e.target.value)}>
            {MODELS.map(m => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
          </Select>
        </FormControl>
      </Grid>

      <Grid item xs={12}>
        <Divider sx={{ my: 1 }}>
          <Chip label="联邦训练配置" size="small" color="primary" variant="outlined" />
        </Divider>
      </Grid>

      <Grid item xs={12} sm={4}>
        <TextField fullWidth type="number" label="客户端数量 (4-20)" value={config.num_clients}
          InputProps={{ inputProps: { min: 4, max: 20 } }} onChange={(e) => handleChange('num_clients', parseInt(e.target.value) || 10)} />
      </Grid>
      <Grid item xs={12} sm={4}>
        <TextField fullWidth type="number" label="通信轮次" value={config.num_rounds}
          InputProps={{ inputProps: { min: 1, max: 200 } }} onChange={(e) => handleChange('num_rounds', parseInt(e.target.value) || 20)} />
      </Grid>
      <Grid item xs={12} sm={4}>
        <TextField fullWidth type="number" label="本地 Epochs" value={config.local_epochs}
          InputProps={{ inputProps: { min: 1, max: 50 } }} onChange={(e) => handleChange('local_epochs', parseInt(e.target.value) || 5)} />
      </Grid>
      <Grid item xs={12} sm={4}>
        <FormControl fullWidth>
          <InputLabel>聚合算法</InputLabel>
          <Select value={config.algorithm} label="聚合算法" onChange={(e) => handleChange('algorithm', e.target.value)}>
            {ALGORITHMS.map(a => <MenuItem key={a.value} value={a.value}>{a.label}</MenuItem>)}
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12} sm={4}>
        <TextField fullWidth type="number" label="批量大小" value={config.batch_size}
          InputProps={{ inputProps: { min: 1, max: 512 } }} onChange={(e) => handleChange('batch_size', parseInt(e.target.value) || 64)} />
      </Grid>
      <Grid item xs={12} sm={4}>
        <TextField fullWidth type="number" label="学习率" value={config.learning_rate}
          InputProps={{ inputProps: { min: 0.0001, max: 1, step: 0.0001 } }} onChange={(e) => handleChange('learning_rate', parseFloat(e.target.value) || 0.01)} />
      </Grid>
      <Grid item xs={12}>
        <Typography gutterBottom>客户端采样率: {(config.client_sample_rate * 100).toFixed(0)}%</Typography>
        <Slider value={config.client_sample_rate * 100} min={10} max={100} step={5} onChange={(_, v) => handleChange('client_sample_rate', v / 100)} />
      </Grid>

      {config.algorithm === 'fedprox' && (
        <Grid item xs={12}>
          <Typography gutterBottom>FedProx μ (近端系数): {config.fedprox_mu}</Typography>
          <Slider value={config.fedprox_mu} min={0} max={1} step={0.001} onChange={(_, v) => handleChange('fedprox_mu', v)} />
        </Grid>
      )}

      <Grid item xs={12}>
        <Divider sx={{ my: 1 }}>
          <Chip label="隐私与安全" size="small" color="secondary" variant="outlined" />
        </Divider>
      </Grid>

      <Grid item xs={12} sm={6}>
        <FormControlLabel
          control={<Switch checked={config.secure_aggregation} onChange={(e) => handleChange('secure_aggregation', e.target.checked)} />}
          label={
            <Box>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>安全聚合 (Shamir秘密共享)</Typography>
              <Typography variant="caption" color="text.secondary">Server看不到单个Client更新明文</Typography>
            </Box>
          }
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <FormControlLabel
          control={<Switch checked={config.differential_privacy} onChange={(e) => handleChange('differential_privacy', e.target.checked)} />}
          label={
            <Box>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>差分隐私 (DP)</Typography>
              <Typography variant="caption" color="text.secondary">梯度裁剪 + 高斯噪声，追踪隐私预算ε</Typography>
            </Box>
          }
        />
      </Grid>

      {config.secure_aggregation && (
        <>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth type="number" label="秘密共享阈值 t" value={config.secagg_threshold}
              helperText={`至少 t个Client存活才能正确恢复，建议 <= ${Math.max(2, config.num_clients - 2)}`}
              InputProps={{ inputProps: { min: 2, max: config.num_clients } }}
              onChange={(e) => handleChange('secagg_threshold', Math.min(config.num_clients, parseInt(e.target.value) || 2))} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Box>
              <Typography gutterBottom>客户端掉线率模拟: {(config.secagg_dropout_rate * 100).toFixed(0)}%</Typography>
              <Slider value={config.secagg_dropout_rate * 100} min={0} max={50} step={1} onChange={(_, v) => handleChange('secagg_dropout_rate', v / 100)} />
            </Box>
          </Grid>
        </>
      )}

      {config.differential_privacy && (
        <>
          <Grid item xs={12} sm={4}>
            <Box>
              <Typography gutterBottom>梯度裁剪阈值 C: {config.dp_clip_norm}</Typography>
              <Slider value={config.dp_clip_norm} min={0.1} max={5} step={0.1} onChange={(_, v) => handleChange('dp_clip_norm', v)} />
            </Box>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Box>
              <Typography gutterBottom>噪声倍率 σ': {config.dp_noise_multiplier}</Typography>
              <Slider value={config.dp_noise_multiplier} min={0.1} max={5} step={0.1} onChange={(_, v) => handleChange('dp_noise_multiplier', v)} />
            </Box>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth type="number" label="目标隐私预算 ε" value={config.dp_target_epsilon}
              InputProps={{ inputProps: { min: 0.1, max: 100, step: 0.1 } }} onChange={(e) => handleChange('dp_target_epsilon', parseFloat(e.target.value) || 5)} />
          </Grid>
        </>
      )}

      <Grid item xs={12}>
        <Divider sx={{ my: 1 }}>
          <Chip label="非IID数据分布" size="small" color="warning" variant="outlined" />
        </Divider>
      </Grid>
      <Grid item xs={12} sm={6}>
        <FormControl fullWidth>
          <InputLabel>非IID模式</InputLabel>
          <Select value={config.non_iid_mode} label="非IID模式" onChange={(e) => handleChange('non_iid_mode', e.target.value)}>
            {NON_IID_MODES.map(m => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12} sm={6}>
        <Box>
          <Typography gutterBottom>
            {config.non_iid_mode === 'iid' ? '参数未启用' : `偏斜程度 α: ${config.non_iid_alpha}`}
          </Typography>
          <Slider value={config.non_iid_alpha} min={0.01} max={5} step={0.01} disabled={config.non_iid_mode === 'iid'}
            onChange={(_, v) => handleChange('non_iid_alpha', v)} />
          {config.non_iid_mode !== 'iid' && (
            <Typography variant="caption" color="text.secondary">α越小偏斜越严重 (0.01=极端偏斜, 5=近似IID)</Typography>
          )}
        </Box>
      </Grid>

      <Grid item xs={12}>
        <Divider sx={{ my: 1 }}>
          <Chip label="拜占庭攻击与鲁棒聚合" size="small" color="error" variant="outlined" />
        </Divider>
      </Grid>
      <Grid item xs={12} sm={4}>
        <TextField fullWidth type="number" label="恶意客户端数量" value={config.num_byzantine}
          helperText={`建议 < ${Math.floor(config.num_clients / 2)}`}
          InputProps={{ inputProps: { min: 0, max: Math.floor(config.num_clients / 2) } }}
          onChange={(e) => handleChange('num_byzantine', Math.min(Math.floor(config.num_clients / 2), parseInt(e.target.value) || 0))} />
      </Grid>
      {config.num_byzantine > 0 && (
        <>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth>
              <InputLabel>攻击类型</InputLabel>
              <Select value={config.byzantine_attack} label="攻击类型" onChange={(e) => handleChange('byzantine_attack', e.target.value)}>
                {BYZANTINE_ATTACKS.map(a => <MenuItem key={a.value} value={a.value}>{a.label}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth>
              <InputLabel>鲁棒聚合算法</InputLabel>
              <Select value={config.robust_aggregation} label="鲁棒聚合算法" onChange={(e) => handleChange('robust_aggregation', e.target.value)}>
                {ROBUST_AGGS.map(a => <MenuItem key={a.value} value={a.value}>{a.label}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
        </>
      )}
    </Grid>
  )

  const renderTemplateTab = () => (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        选择一个预定义模板快速创建实验，选中后可在参数表单中微调配置
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {templates.map((t, idx) => (
          <Grid item xs={12} sm={6} md={4} key={t.id}>
            <Card
              variant="outlined"
              sx={{
                borderColor: selectedTemplateId === t.id ? TEMPLATE_COLORS[idx] : 'divider',
                borderWidth: selectedTemplateId === t.id ? 2 : 1,
                bgcolor: selectedTemplateId === t.id ? `${TEMPLATE_COLORS[idx]}08` : 'background.paper',
                transition: 'all 0.2s',
                '&:hover': { borderColor: TEMPLATE_COLORS[idx], boxShadow: 2 }
              }}
            >
              <CardActionArea onClick={() => handleSelectTemplate(t)} sx={{ p: 0 }}>
                <CardContent>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: TEMPLATE_COLORS[idx] }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      {t.name}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, minHeight: 40 }}>
                    {t.description}
                  </Typography>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {Object.entries(t.key_params).map(([k, v]) => (
                      <Chip key={k} label={`${k}: ${v}`} size="small" variant="outlined" sx={{ fontSize: 11 }} />
                    ))}
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>

      {selectedTemplateId && (
        <>
          <Divider sx={{ my: 2 }}>
            <Chip label="模板参数 (可微调)" size="small" color="primary" />
          </Divider>
          {renderConfigForm()}
        </>
      )}
    </Box>
  )

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth PaperProps={{ sx: { maxHeight: '90vh' } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>
        创建联邦学习实验
        <Tabs value={tabValue} onChange={handleTabChange} sx={{ mt: 1 }}>
          <Tab label="自定义创建" />
          <Tab label="从模板创建" />
        </Tabs>
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {tabValue === 0 && renderConfigForm()}
        {tabValue === 1 && renderTemplateTab()}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose} disabled={submitting}>取消</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={submitting || !config.name || (tabValue === 1 && !selectedTemplateId)}>
          {submitting ? '创建中...' : '创建并启动实验'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
