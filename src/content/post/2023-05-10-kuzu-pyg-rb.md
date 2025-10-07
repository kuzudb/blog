---
slug: "kuzu-pyg-remote-backend"
title: "Scaling Pytorch Geometric GNNs With Kuzu"
description: "A walkthrough on how to use Kuzu as a Pytorch Geometric (PyG) remote backend"
pubDate: "May 10 2023"
heroImage: "/img/default.png"
categories: ["tutorial"]
authors: ["chang", "semih"]
tags: ["pytorch-geometric", "gnn"]
---

In this post, we'll walk through how to use Kuzu as a [Pytorch Geometric (PyG) _Remote Backend_](https://pytorch-geometric.readthedocs.io/en/latest/advanced/remote.html) to train a GNN model on very large graphs that do not fit on your machine's RAM. 

Let's start with a quick overview of PyG Remote Backends: PyG Remote Backends are plug-in replacements for PyG's in-memory graph and feature stores, so they can be used seamlessly with the rest of the PyG interfaces to develop your GNN models. If a PyG Remote Backend is a disk-based storage system, such as Kuzu, PyG will fetch subgraphs from Kuzu, which stores and scans its data from disk, allowing you to train models on very large graphs for which PyG's in-memory storage would run out of memory and fail.

As you'll see, if you already have PyG models you have developed in Python, replacing PyG's default storage with Kuzu is extremely simple. ***It 
consists of loading your graph into Kuzu and then changing 1 line of code in your PyG model***. To demonstrate how simple this is and how it performs,
se will follow this [Sample Code](https://github.com/pyg-team/pytorch_geometric/tree/master/examples/kuzu/papers_100M) to demonstrate how to do this.
So let's get to it!

## Dataset, Predictive Task, and GNN Model

Let's start by describing our graph dataset, our predictive task, and the GNN model we will use for the predictive task.

**Dataset**: We will use the `ogbn-papers100M` dataset of ~100M nodes and ~2.5B edges from the [Open Graph Benchmark](https://ogb.stanford.edu/) (OGB). To find the dataset,
you can search for "ogbn-papers100M" [here](https://ogb.stanford.edu/docs/nodeprop/). The dataset takes about 128GB of RAM when using PyG's default in-memory storage. The graph's nodes and edges model the following:

_Nodes_ are papers that have these properties:

- `ID`: an int64 node identifier
- `year`: the publication date of the paper (you can ignore this as it will not be used in our example but this property is part of the dataset)
- `x`: 128-dimensional node features (so 128-size float tensors)
- `y`: a numeric label indicating the category/field of the paper. These numbers indicate different [arXiv categories](https://arxiv.org/category_taxonomy) for
  papers. Although the exact mapping is not important, you can think of these for example as 0 indicating "physics", 2 indicating "geometry" etc.

_Edges/Relationships_ are citations between papers and do not contain any properties.

**Predictive task:** Predict the `y` labels of nodes using the node features stored in the `x` properties.

**GNN Model**: We will train a 3-layer GraphSage model that contains 5.6 million parameters to perform this predictive task. Our model is based on the implementation [here](https://github.com/mengyangniu/ogbn-papers100m-sage/tree/main). We picked this model because it was one of the better-performing models in the [PyG Leaderboard for the ogbn-papers100M dataset](https://ogb.stanford.edu/docs/leader_nodeprop/) (search "GraphSAGE_res_incep" under "Leaderboard for ogbn-papers100M") that we could develop using pre-existing layers in the PyG library (so we do not have to write any custom layers).

## Step 1: Preliminaries and Loading ogbn-papers100M into Kuzu

As a preliminary, the [`prepare_data.py`](https://github.com/pyg-team/pytorch_geometric/blob/master/examples/kuzu/papers_100M/prepare_data.py) script in [Sample Code](https://github.com/pyg-team/pytorch_geometric/tree/master/examples/kuzu/papers_100M) generates four numpy files for each property of the papers: (i) `./ids.npy`; (ii) `./node_feat.npy` (storing `x` properties); (iii) `./node_year.npy`; and (iv) `./node_label.npy` (storing `y` labels). In addition, it will generate an `./edge_index.csv` file that stores the citation relationships. In the below code snippets, we will assume you have gone through those steps.

Let's start with how you load the `ogbn-papers100M` dataset into Kuzu. You will first need to define a `paper` NODE TABLE and a `cite` REL TABLE, whose schemas will follow exactly the structure of the dataset and then use `COPY FROM` statements in Kuzu's version of Cypher to ingest those numpy and csv files into your `paper` and `cite` tables:

```py
# ...
import kuzu
import numpy as np
# ...

print("Creating an empty Kuzu database under the papers100M directory...")
db = kuzu.Database('papers100M')
conn = kuzu.Connection(db, num_threads=cpu_count())
print("Creating Kuzu tables...")
conn.execute(
    "CREATE NODE TABLE paper(id INT64, x FLOAT[128], year INT64, y FLOAT, "
    "PRIMARY KEY (id));")
conn.execute("CREATE REL TABLE cites (FROM paper TO paper, MANY_MANY);")
print("Copying nodes to Kuzu tables...")
conn.execute('COPY paper FROM ("%s",  "%s",  "%s", "%s") BY COLUMN;' %
             ('./ids.npy', './node_feat.npy', './node_year.npy', './node_label.npy'))
print("Copying edges to Kuzu tables...")
conn.execute('COPY cites FROM "%s";' % ('./edge_index.csv'))
print("All done!")
```

The one important note here is that you should store your node features using [Kuzu's FIXED-LIST data type](https://kuzudb.github.io/docs/cypher/data-types/list.html) using `FLOAT[128]` syntax (instead of the less efficient VAR-LIST data type, which uses `FLOAT[]` syntax for lists that can have different lengths). FIXED-LIST is a data type that we specifically added to Kuzu to efficiently store node features and embeddings in graph ML applications.

## Step 2: Get Kuzu Remote Backend by Calling `db.get_torch_geometric_remote_backend()`

After loading your data to Kuzu, the only thing you have to do is to call the `get_torch_geometric_remote_backend()` function on your Database object `db`:

```py
feature_store, graph_store = db.get_torch_geometric_remote_backend(multiprocessing.cpu_count())
```

This function returns two objects that implement PyG's Remote Backend interfaces: (i) `feature_store` is an instance of [`torch_geometric.data.FeatureStore`](https://pytorch-geometric.readthedocs.io/en/latest/generated/torch_geometric.data.FeatureStore.html#torch_geometric.data.FeatureStore); and (ii) `graph_store` is an instance of [`torch_geometric.data.GraphStore`](https://pytorch-geometric.readthedocs.io/en/latest/generated/torch_geometric.data.GraphStore.html#torch_geometric.data.GraphStore). These two handles are your Kuzu Remote Backends that you can pass to your PyG models/subgraph samplers and they will make your existing PyG models work seamlessly with Kuzu! That's all
you really have to know about how to use Kuzu as a Remote Backend. ***There is no more Kuzu functions you have to call in the rest of the demonstration. You only have
to do 1 line of code change in your regular PyG code.***
The rest of the example contains standard code you normally write to develop your PyG models.

## Step 3: Define & Pass Kuzu's `feature_store` and `graph_store` to your GNN Model

First, we'll define the GraphSage model in PyG. We'll put `...`'s here and there to shorten the example because, as we said above, this is your regular PyG code:

```py
# Define the model for training. The model is ported from
# https://github.com/mengyangniu/ogbn-papers100m-sage
class SAGE(nn.Module):
    def __init__(self, in_feats, n_hidden, n_classes, n_layers, activation,
                 dropout):
        super().__init__()
        self.n_layers = n_layers
        ...

    def forward(self, edge_list, x):
        ...
        for layer_index, layer in enumerate(self.layers):
            ....
        return self.mlp(collect)
```

Next, we will enable PyG to use Kuzu's Remote Backend when training. We create a [`torch_geometric.loader.NeighborLoader`](https://pytorch-geometric.readthedocs.io/en/latest/_modules/torch_geometric/loader/neighbor_loader.html), which is the subgraph sampler we will use, and pass the `feature_store` and `graph_store` we obtained from Kuzu to it. ***This is the 1 line change you have to do!***

```py
# Plug the graph store and feature store into the NeighborLoader
kuzu_sampler = NeighborLoader(
    data=(feature_store, graph_store),
    num_neighbors={('paper', 'cites', 'paper'): [12, 12, 12]},
    batch_size=LOADER_BATCH_SIZE,
    input_nodes=('paper', input_nodes),
    num_workers=4,
    filter_per_worker=False,
)
```

**`data=(feature_store, graph_store)`** is the important line. When you use this sampler in training to construct mini-batches, it will perform subgraph sampling and load the required node features from Kuzu automatically and return a [`torch_geometric.data.HeteroData`](https://pytorch-geometric.readthedocs.io/en/latest/generated/torch_geometric.data.HeteroData.html) object, which can be directly plugged into a GNN model. That training code looks like this (again abbreviated because this is all PyG code):

```py
model = SAGE(128, 1024, 172, 3, torch.nn.functional.relu, 0.2)
...
optimizer = torch.optim.Adam(model.parameters(), lr=0.01, weight_decay=5e-4)
criterion = torch.nn.CrossEntropyLoss()

for epoch in range(NUM_EPOCHS):
    i = 0
    start_time = time.time()
    // **The below for loop line is where we ask the sampler to
    // sample a mini batch
    for b in kuzu_sampler:
        x = b['paper']['x']
        y = b['paper']['y']
        edge_index = b['paper', 'cites', 'paper'].edge_index
        ...
        model.train()
        optimizer.zero_grad()
        out = model(edge_index, x)
        loss = criterion(out, y)
        loss.backward()
        optimizer.step()
        ...
        i += 1
```

`for b in kuzu_sampler:` is the exact line where the sampler will end up calling on Kuzu to sample a subgraph and scan the features of the nodes in that subgraph. This all ends up using Kuzu's disk-based storage, allowing you to train GNNs on graphs that don't fit on your RAM. One distinct advantage of Kuzu is that, because it is an embeddable DBMS, 
we can do the conversion of scanned node features from Kuzu into PyG's tensors as a zero-copy operation. We simply write the scanned node features into a buffer array allocated in Python without any additional data transfer between the systems.

Currently, only the `feature_store` scans data from Kuzu's disk-based storage. For `graph_store`, our current implementation stores the entire graph topology in COO format in memory. This does limit how much you can scale, but in many models trained on large graphs, features take up more space than the graph topology, so scaling node features out of memory should still allow you to scale to very lage graphs that won't fit in your RAM.

### Adjusting Kuzu's Buffer Pool Size

As with most DBMSs, Kuzu has a Buffer Manager that maintains a buffer pool to keep parts of the database in memory. When you use Kuzu, you decide how much memory to allocate to it. The more memory you give to Kuzu, the less I/O it will perform on scans. So, in the context of this post, the larger the buffer manager size you set, the faster your training time will be when training large graphs out of memory. You set Kuzu's buffer pool size when you construct your `Database` object, before you call the `get_torch_geometric_remote_backend()` function. For example, the code below sets the BM size to `40 * 1024**3` bytes, which is equal to 40GB. You should set it as high as possible without running out of memory for performance reasons.

```py
KUZU_BM_SIZE = 40 * 1024**3
# Create kuzu database
db = kuzu.Database("papers100M", KUZU_BM_SIZE)
feature_store, graph_store = db.get_torch_geometric_remote_backend(
    mp.cpu_count())
```

## An Experiment Demonstrating Throughput Numbers With Different Buffer Pool Sizes

Let's demonstrate what troughput numbers you can expect under different memory settings.
As a baseline we will first measure the throughput of training
as time/batch using PyG's default in-memory
storage. This seting uses ~106GB of memory.
We will then simulate limited memory settings by training the same
model using Kuzu Remote Backend and limiting Kuzu's buffer pool size to
different levels.
Here are the important configurations for the experiment:

- Available RAM in the machine: 384GB RAM
- CPU: Two Xeon Platinum 8175M (48 cores/96 threads)
- GPU: RTX 4090 with 24GB GPU memory
- SSD in the system for disk storage: 2TB Kingston KC3000 NVMe SSD
- Mini-batch size: 1152. Recall the `kuzu_sampler = NeighborLoader(...)` that we defined above. There we gave this argument
  `num_neighbors={('paper', 'cites', 'paper'): [12, 12, 12]}` to the `NeighborLoader`, which means that the sampler will sample 3-degree neighbors of these 1152 nodes,
  sampling 12 neighbors at each degree.
  We picked 1152 as our mini-batch size because this is the size at which we generate batches that take a peak of 23GB of memory, so beyond this we would run out of GPU memory. [^1]
- \# PyG Workers: 16 (we did a parameter sweep and setting this to 4, 8, 16 perform very similarly)
- \# Kuzu Query Processor Threads: 24 (48 and 96 also perform similarly)

We will run Kuzu with 60GB, 40GB, 20GB, and 10GB buffer pool size.
The lower Kuzu's buffer pool size, the more
disk I/Os Kuzu will perform. Note however that in this experiment Kuzu will use more memory than
these sizes for two reasons: (i) Kuzu stores some parts of the database always in memory
though this is not very important in this setting; (ii) As we said, currently
Kuzu Remote Backend uses in-memory storage for the graph topology (but not node features!),
which takes ~48GB of RAM. So you can roughly think of Kuzu using 48 + BM size in these experiments.

We will do 500 batches of training and report the throughput number as average end-to-end time/batch.
We also report the time that's spent on GPU for Training as `Training Time (s)` and
time spent on copying data from CPU to GPU as `CPU-to-GPU Copying Time (s)`. For
Kuzu configurations, you can roughly
interpret `Per Batch Time (s) -  Training Time (s) -  CPU-to-GPU Copying Time (s)`
as the time spent for scanning data from Kuzu into CPU's memory. We expect that to increase
as we lower the BM size.

| Configuration                 | Per Batch Time (s) | Training Time (s) | CPU-to-GPU Copying Time | Time Scanning Data from Kuzu | Memory Usage |
| ----------------------------- | ------------------ | ----------------- | ----------------------- | ---------------------------- | ------------ |
| PyG In-memory                 | 0.281              | 0.240             | 0.024                   | ---                          | ~110 GB      |
| Kuzu Remote Backend (bm=60GB) | 0.380 (1.35x)      | 0.239             | 0.018                   | 0.123                        | ~110 GB      |
| Kuzu Remote Backend (bm=40GB) | 0.513 (1.82x)      | 0.239             | 0.022                   | 0.251                        | ~90 GB       |
| Kuzu Remote Backend (bm=20GB) | 1.162 (4.88x)      | 0.238             | 0.022                   | 0.901                        | ~70 GB       |
| Kuzu Remote Backend (bm=10GB) | 1.190 (4.23x)      | 0.238             | 0.022                   | 0.930                        | ~60 GB       |

So, when have enough memory, there is about 1.35x slow down (from 0.281s to 0.380s per batch)
compared to using PyG's default storage. This
is the case when Kuzu has enough buffer memory (60GB) to store the features but we still incur the cost of
scanning them through Kuzu's buffer manager. So no disk I/O happens (except the first time
the features are scanned to the buffer manager). When we use 40GB of buffer pool and below, we start doing some I/O,
and the average time per batch degrade to 0.513, 1.162, amd 1.190 respectively when using 40GB, 20GB, and 10GB.
We seem to stabilize around 4x degradation at 10GB or 20GB level, where most of the feature scans
are now happening from disk. These numbers hopefully look good for many settings!

## Next Steps

We will be doing two immediate optimizations in the next few releases
related to Kuzu's PyG integration.
First, we will change our `graph_store` to use an in DBMS subgraph sampler, so we can virtually work at any limited memory level.
Second, in an even earlier release, we had a more basic PyG integration feature, the
[`QueryResult.get_as_torch_geometric()`](https://kuzudb.github.io/docs/client-apis/python-api/query-result.html#query_result.QueryResult.get_as_torch_geometric) function.
This feature is more of an ETL feature. It is designed for cases where you want to filter
a subset of your nodes and edges and convert them directly into PyG `HeteroData` objects (i.e., use PyG's default in-memory storage)
as you build PyG pipelines using graph databases you store in Kuzu.
If you are converting a large graph this can be quite slow, and we will be improving this so that such ETL pipelines
are much faster!

We are excited to hear about your feedback on Kuzu's PyG integration features and get more ideas about
how else we can help users who are building GNN pipelines. Please reach out to us on [Discord](https://discord.gg/VtX2gw9Rug)
with your questions and ideas!

---

[^1]: If you read our [v0.0.3 blog post](../kuzu-0.0.3-release),
which had a shorter section about PyG interface, you will notice that we used a much larger batch size there (48000),
which was the size that saturated GPU memory. Although the example there was also on the `ogbn-papers100M` dataset, we used a much smaller model with ~200K parameters
and sampled subgraphs from 2 degree neighbors of these batches. Now we use a much larger model with 5.6 million parameters and samples from 3-degree neighbors.
