---
title: "Linux中的信号"
date: 2026-07-26
draft: false
column: learning
tags:
    - learning record
    - Notebook
    - Linux
---

信号是 Linux 系统中的一种内核和进程之间的消息机制，用于通知进程系统中发生了某种类型的事件。一个进程也可以通过系统调用向某个进程发送信号。

信号的传递分为两步：
1. 发送信号
2. 目的进程接收信号

### 发送信号

发送信号有两种原因：

1. **内核侦测到系统事件** — 比如发生非法内存访问或子进程退出时，内核就会向目的进程发送和事件相关联的信号。
2. **用户进程通过系统调用 `kill` 向目的进程发送信号**。每个进程都属于一个进程组，父进程和子进程默认属于同一个进程组。使用 `kill` 向其他进程发送信号：
   - `pid > 0` — 发送给指定 pid 对应的进程
   - `pid < 0` — 发送信号给指定进程所在进程组的每个进程
   - `pid = 0` — 发送给调用进程所在进程组的每个进程，包括自己

内核为进程维护着一个待处理信号的集合 `pending` 位向量和阻塞信号的集合 `blocked` 位向量。侦测到发生某种类型的系统事件时，就把 `pending` 位向量中对应信号的标志位置为 1，标记此进程有一个待处理信号。因为它是标志位，所以只能知道有没有，而不能知道收到了多少次信号。

### 目的进程接收信号

当内核把进程 p 从内核模式切换到用户模式时，它会检查未被阻塞的待处理信号的集合 `(pending & ~blocked)`。如果非空，就选择集合中的某个信号 k（通常是最小的 k），把控制传递到进程 p 对应的信号处理程序，然后清空信号 k（`pending` 位向量中对应信号的标志位重置为 0）。

## 自定义信号处理行为

每个信号有与它相关联的**默认行为**。比如键盘按下 `Ctrl+C`，系统向当前正在工作的进程发送 `SIGINT` 信号（键盘中断事件），默认会终止进程。进程可以通过注册信号处理函数，修改信号对应的默认行为。唯一的例外是 `SIGSTOP` 和 `SIGKILL` 信号。

在 Linux 下可以使用 `signal(signum, handler)` 为信号 `signum` 注册自定义的信号处理函数 `handler`。不过 `signal` 函数在不同的系统上有不同的语义，为此 POSIX 标准定义了 `sigaction` 函数，允许用户在设置信号处理程序时明确指定它们想要的信号处理语义。所以为了兼容性，工程上更好的实践是把 `sigaction` 包装成 `Signal(signum, handler)`，兼顾易用和兼容性。

>  `sigaction` 的封装，确保跨平台兼容性。

```cpp
using handler_t = void (*)(int);

/**
 * @brief 封装信号注册函数 sigaction
 *
 * @param signum  信号
 * @param handler 信号对应的处理函数
 *
 * @return 成功时返回指向前次处理程序的指针，否则返回 SIG_ERR（不设置 errno）
 */
handler_t Signal(int signum, handler_t handler)
{
    struct sigaction act, old_act;
    act.sa_handler = handler;
    sigemptyset(&act.sa_mask);
    act.sa_flags = 0;
    if (sigaction(signum, &act, &old_act) < 0)
    {
        return SIG_ERR;
    }
    return old_act.sa_handler;
}
```

## 隐式和显式阻塞信号

Linux 提供隐式和显式阻塞信号的机制：

- **隐式阻塞机制**：内核默认阻塞当前信号处理程序正在处理的信号类型。即在信号 s 的处理期间，再收到一个信号 s，直到处理程序返回，s 变成待处理而没有被接收。
- **显式阻塞机制**：应用程序可以使用 `sigprocmask` 函数和它的辅助函数，明确地阻塞和解除阻塞选定的信号。

> 用于显式阻塞/解除阻塞信号的核心系统调用及辅助函数。

```cpp
/**
 * @brief 改变当前阻塞的信号集合，具体行为依赖于 how 的值
 *        SIG_BLOCK   : 把 set 中的信号添加到 blocked 中
 *        SIG_UNBLOCK : 从 blocked 中删除 set 中的信号
 *        SIG_SETMASK : block = set
 */
int sigprocmask(int how, const sigset_t* set, sigset_t* oldset);

/**
 * @brief 初始化 set 为空集合
 */
int sigemptyset(sigset_t* set);

/**
 * @brief 把每个信号都添加到 set 中
 */
int sigfillset(sigset_t* set);

/**
 * @brief 把 signum 添加到 set
 */
int sigaddset(sigset_t* set, int signum);

/**
 * @brief 从 set 中删除 signum
 */
int sigdelset(sigset_t* set, int signum);

/**
 * @brief 检查 signum 是否是 set 的成员
 * @return 是返回 1，否则返回 0
 */
int sigismember(const sigset_t* set, int signum);
```

## 编写安全的信号处理程序的几个保守准则

因为信号处理程序和主流程是并发的（因中断导致的并发），为了编写出异步安全的信号处理程序，最好遵守以下准则：

1. **处理程序要尽可能简单** — 最好只是设置全局标志并返回，信号相关处理全在主流程执行。
2. **只调用异步信号安全的函数** — 它要么是可重入的，要么是不能被信号中断的。
3. **保存和恢复 `errno`** — 避免干扰主程序中依赖 `errno` 的部分。
4. **阻塞所有信号，保护对全局共享数据结构的访问**。
5. **用 `volatile` 声明全局变量** — 避免编译器优化导致变量缓存在寄存器，进而导致异步更新不可见。
6. **用 `sig_atomic_t` 声明标志** — 保证对标志的读写是原子的（不可中断）。

总结起来就是：

- **可能的情况下尽量保证同步**
- **必须要异步的情况下保证原子性**
- **用锁来保护不可行** — 存在死锁问题：主流程加锁后被中断，信号处理程序中再申请锁导致死锁。

## 显式地等待信号

在某些情况下，我们需要显式地等待信号处理程序执行。比如 Shell 中开始一个前台作业后，必须要显式等待它结束再接收用户命令。

要实现这个显式等待，可以像下面的示例一样，在信号处理程序中使用 `waitpid` 回收子进程，在主流程中循环检查 pid，直到回收后再继续处理。

> 示例来自 CSAPP[^1]，使用空循环显式等待信号

```cpp
#include "csapp.h"

volatile sig_atomic_t pid;

void sigchld_handler(int s)
{
    int olderrno = errno;
    pid = Waitpid(-1, NULL, 0);
    errno = olderrno;
}

void sigint_handler(int s)
{
}

int main(int argc, char **argv) 
{
    sigset_t mask, prev;

    Signal(SIGCHLD, sigchld_handler);
    Signal(SIGINT, sigint_handler);
    Sigemptyset(&mask);
    Sigaddset(&mask, SIGCHLD);

    while (1) {
        Sigprocmask(SIG_BLOCK, &mask, &prev); /* Block SIGCHLD */
        if (Fork() == 0) /* Child */
            exit(0);

        /* Parent */
        pid = 0; 
        Sigprocmask(SIG_SETMASK, &prev, NULL); /* Unblock SIGCHLD */
        
        /* Wait for SIGCHLD to be received (wasteful) */
        while (!pid) 
            ;

        /* Do some work after receiving SIGCHLD */
        printf(".");
    }
    exit(0);
}
```

在这个循环检查中，空循环浪费 CPU；使用 `pause()` 会因为竞争导致永远睡眠；使用 `sleep` 利用超时机制避免了永远睡眠，但是太慢。合适的方法是使用 **`sigsuspend`** 显式等待信号：在 `while` 检查条件时保持对信号的阻塞，在 `sigsuspend` 内部原子地解除阻塞并睡眠，以避免竞态导致的信号丢失问题。

> 示例来自 CSAPP，使用 `sigsuspend` 正确地等待信号

```cpp
while (1) {
    Sigprocmask(SIG_BLOCK, &mask, &prev); /* Block SIGCHLD */
    if (Fork() == 0) /* Child */
        exit(0);

    /* Wait for SIGCHLD to be received */
    pid = 0;
    while (!pid) 
        Sigsuspend(&prev);

    /* Optionally unblock SIGCHLD */
    Sigprocmask(SIG_SETMASK, &prev, NULL); 

    /* Do some work after receiving SIGCHLD */
    printf(".");
}
```

[^1]: Computer Systems: A Programmer's Perspective
