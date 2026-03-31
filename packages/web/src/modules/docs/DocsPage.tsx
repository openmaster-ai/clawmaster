export default function Docs() {
  const toc = [
    { title: '入门指南', children: ['安装', '快速开始', '配置向导'] },
    { title: '基础功能', children: ['网关', '通道', '模型'] },
    { title: '进阶功能', children: ['Skills', 'Agents', '配置文件'] },
    { title: '常见问题', children: [] },
  ]

  return (
    <div className="flex h-[calc(100vh-8rem)]">
      {/* TOC */}
      <aside className="w-56 border-r border-border pr-4 overflow-auto">
        <input
          type="text"
          placeholder="🔍 搜索文档..."
          className="w-full px-3 py-2 bg-muted rounded border border-border mb-4 text-sm"
        />

        {toc.map((section) => (
          <div key={section.title} className="mb-3">
            <div className="font-medium text-sm mb-1">{section.title}</div>
            {section.children.map((child) => (
              <a
                key={child}
                href="#"
                className="block py-1 px-3 text-sm text-muted-foreground hover:text-foreground"
              >
                {child}
              </a>
            ))}
          </div>
        ))}

        <div className="border-t border-border pt-3 mt-3">
          <p className="text-xs text-muted-foreground">📥 离线缓存</p>
          <p className="text-xs text-muted-foreground">更新于 3天前</p>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 pl-6 overflow-auto">
        <h1 className="text-2xl font-bold mb-6">安装 OpenClaw</h1>

        <h2 className="text-xl font-medium mb-3">系统要求</h2>
        <ul className="list-disc list-inside text-muted-foreground mb-6">
          <li>Node.js 18 或更高版本</li>
          <li>npm 或 yarn</li>
          <li>Git（可选）</li>
        </ul>

        <h2 className="text-xl font-medium mb-3">安装步骤</h2>
        <pre className="bg-muted p-4 rounded-lg text-sm mb-6">npm install -g openclaw</pre>

        <p className="text-muted-foreground mb-4">安装完成后，运行：</p>
        <pre className="bg-muted p-4 rounded-lg text-sm">openclaw setup</pre>
      </main>

      {/* Status */}
      <div className="absolute bottom-4 right-4 text-xs text-muted-foreground">
        文档状态: ✓ 已缓存 (可离线访问) | 最后更新: 2026-03-17
      </div>
    </div>
  )
}
