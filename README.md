# 联邦学习安全聚合与模型训练实验平台

一个面向研究人员的联邦学习实验平台，用于模拟多机构协作训练场景下的**隐私保护**和**对抗攻击**问题。

## 功能特性

### 🏗️ 联邦架构
- **中心Server + N个Client架构**：支持 4-20 个客户端
- **Client采样**：可调采样率（默认100%），每轮随机选取参与客户端
- **通信轮次**：按Round推进训练，支持实时进度推送

### 📊 训练算法
- **FedAvg**：按数据量加权平均聚合
- **FedProx**：近端正则项约束（系数μ可调），缓解Non-IID下的漂移
- **本地训练**：可调本地Epoch数、Batch Size、学习率

### 🔐 安全聚合 (Secure Aggregation)
- 基于 **Shamir秘密共享**的安全聚合协议
- Server无法看到单个Client的明文更新
- 支持**客户端掉线**处理（阈值t参数控制最少存活数）
- 掩码互相抵消得到真实聚合结果

### 🛡️ 差分隐私 (DP)
- **梯度裁剪**：L2范数裁剪到阈值C
- **高斯噪声**：σ = C * noise_multiplier / batch_size
- **隐私预算追踪**：基于Moments Accountant/RDP计算累计ε
- **自动停止**：总ε超过设定上限时自动终止训练

### 📈 非IID数据模拟
| 模式 | 说明 |
|------|------|
| **Label Skew** | 狄利克雷分布控制标签偏斜，α越小越偏斜 |
| **Quantity Skew** | 各Client数据量差异大（最多差10倍） |
| **Feature Skew** | 各Client数据加不同程度噪声扰动 |
| **IID** | 均匀分配（默认） |

### ⚔️ 拜占庭容错
- **攻击类型**：随机噪声、梯度放大10倍、全零更新
- **鲁棒聚合算法**：
  - **Krum**：选与其他更新欧式距离最近的
  - **Trimmed Mean**：每维去掉最大最小值取均值
  - **Coordinate-wise Median**：每维取中位数

### 🧠 模型与数据集
- **数据集**：MNIST、CIFAR-10
- **模型**：
  - MLP（两层全连接）
  - 简单CNN（两层卷积+两层全连接）
  - 简单ResNet（6层）

## 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | React 18 + Vite + Material-UI + Recharts |
| **后端API** | FastAPI + WebSocket |
| **计算引擎** | PyTorch + NumPy |
| **任务队列** | Celery + Redis |
| **数据库** | PostgreSQL 16 |
| **部署** | Docker Compose |

## 快速启动

### 前置要求
- Docker >= 24.0
- Docker Compose >= 2.20

### 一键启动

```bash
cd fedlearn-platform
docker-compose up -d
```

### 访问地址
- 前端面板：http://localhost:3000
- 后端API文档：http://localhost:8000/docs

### 停止服务
```bash
docker-compose down
```

保留数据：
```bash
docker-compose down -v   # 加-v清除所有数据卷
```

## 项目结构

```
fedlearn-platform/
├── backend/                          # 后端计算引擎
│   ├── app/
│   │   ├── core/                     # 核心算法
│   │   │   ├── federated_server.py   # 联邦学习服务器
│   │   │   ├── federated_client.py   # 客户端本地训练
│   │   │   ├── secure_aggregation.py # Shamir安全聚合
│   │   │   ├── differential_privacy.py # 差分隐私引擎
│   │   │   ├── non_iid_data.py       # 非IID数据切分
│   │   │   ├── byzantine.py          # 拜占庭攻击与鲁棒聚合
│   │   │   └── dataset_loader.py     # 数据集加载
│   │   ├── models/
│   │   │   └── nn_models.py          # MLP/CNN/ResNet定义
│   │   ├── worker/
│   │   │   └── tasks.py              # Celery训练任务
│   │   ├── api/
│   │   │   ├── routes.py             # REST API
│   │   │   └── websocket_routes.py   # WebSocket实时推送
│   │   ├── main.py                   # FastAPI入口
│   │   ├── database.py               # 数据库连接
│   │   ├── models.py                 # ORM模型
│   │   ├── schemas.py                # Pydantic Schema
│   │   └── config.py                 # 配置管理
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/                         # 前端实验面板
│   ├── src/
│   │   ├── pages/                    # 页面
│   │   │   ├── Dashboard.jsx         # 实验列表主页
│   │   │   └── ExperimentDetail.jsx  # 实验详情页
│   │   ├── components/               # 组件
│   │   │   ├── CreateExperimentModal.jsx   # 创建实验表单
│   │   │   ├── CompareExperimentsModal.jsx # 多实验对比
│   │   │   ├── AccuracyChart.jsx           # 精度曲线
│   │   │   ├── LossChart.jsx               # 损失曲线
│   │   │   ├── ClientAccuracyBoxplot.jsx   # 客户端精度分布
│   │   │   ├── PrivacyBudgetBar.jsx        # 隐私预算进度
│   │   │   ├── DataDistributionChart.jsx   # 数据分布可视化
│   │   │   ├── ByzantineDetectionChart.jsx # 攻击检测
│   │   │   └── CommunicationStats.jsx      # 通信统计
│   │   ├── services/
│   │   │   ├── api.js                # REST API封装
│   │   │   └── websocket.js          # WebSocket客户端
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── package.json
│   ├── vite.config.js
│   ├── nginx.conf
│   └── Dockerfile
│
├── docker-compose.yml                # 服务编排
├── .env                              # 环境变量
└── README.md
```

## 实验面板功能

### 主界面 (Dashboard)
- 📊 统计卡片：总实验数、运行中、已完成、平均精度
- 📋 实验列表卡片：状态标签、配置Chips、进度条、操作按钮
- ✅ 多选实验进行并排对比
- 🔄 自动5秒刷新状态

### 实验详情页
- 🎯 **全局精度/损失曲线**：按通信轮次实时更新
- 📦 **客户端精度箱线图**：每轮各Client本地精度分布
- 🔒 **隐私预算**：进度条 + 累计消耗曲线，超限时变红
- 🗂️ **数据分布**：各Client样本数柱状图 + 标签分布堆叠图
- 🕵️ **拜占庭检测**：检测到/总数柱状图 + 检测率曲线
- 📡 **通信统计**：总通信量/平均参与率/每轮通信量曲线
- 📝 **实时日志**：彩色终端风格日志输出

### 创建实验向导
- 基础配置：名称、数据集、模型
- 联邦参数：客户端数、轮次、采样率、算法
- 安全选项：安全聚合(阈值/掉线率)、差分隐私(C/σ/ε)
- 数据切分：Non-IID模式 + α偏斜程度
- 攻击配置：拜占庭数量 + 攻击类型 + 鲁棒聚合防御

### 实验对比
- 并排展示2-10个实验的配置卡片
- 叠加精度曲线图（不同颜色区分）
- 可用于分析：Non-IID α对收敛的影响、鲁棒聚合防御效果对比

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/experiments` | 创建实验配置 |
| GET | `/api/experiments` | 列表实验 |
| GET | `/api/experiments/{id}` | 实验详情+轮次结果 |
| POST | `/api/experiments/{id}/start` | 启动实验（提交Celery任务） |
| POST | `/api/experiments/{id}/stop` | 停止实验 |
| DELETE | `/api/experiments/{id}` | 删除实验 |
| GET | `/api/experiments/{id}/rounds` | 轮次结果列表 |
| GET | `/api/experiments/compare?ids=1,2,3` | 多实验对比数据 |
| WS | `/ws/experiment/{id}` | 实时进度WebSocket |

## WebSocket 消息格式

```json
{
  "type": "round_complete",
  "experiment_id": 1,
  "round_num": 5,
  "global_accuracy": 0.9423,
  "global_loss": 0.1872,
  "client_accuracies": [0.91, 0.95, ...],
  "epsilon_consumed": 0.28,
  "byzantine_detected": 2,
  "byzantine_total": 3
}
```

消息类型：`task_started`, `progress`, `round_complete`, `completed`, `error`, `log`, `experiment_stopped`

## 本地开发（不使用Docker）

### 后端
```bash
cd backend
pip install -r requirements.txt
export DATABASE_URL=postgresql://fedlearn:fedlearn123@localhost:5432/fedlearn_db
export REDIS_URL=redis://localhost:6379/0

# 启动数据库（可选Docker单独启动）
# docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=fedlearn123 postgres:16-alpine
# docker run -d -p 6379:6379 redis:7-alpine

# 启动API
uvicorn app.main:app --reload --port 8000

# 启动Celery Worker（另一个终端）
celery -A app.worker.celery_app worker --loglevel=info --concurrency=2
```

### 前端
```bash
cd frontend
npm install
npm run dev
```

## 常见问题

**Q: 第一次启动慢？**
A: 首次需要下载MNIST/CIFAR10数据集，约300MB，之后会缓存到 `fedlearn_data` 数据卷。

**Q: 精度很低？**
A: 增加轮次（如50轮）、调大学习率或尝试FedProx（Non-IID时μ=0.01-0.1）。

**Q: 如何加速训练？**
A: 减少客户端数、降低本地Epoch、使用GPU（需要修改Dockerfile启用CUDA）。

**Q: 隐私预算消耗太快？**
A: 增大C（放宽裁剪）、降低noise_multiplier、减少本地Epoch数。

## License

MIT License
