# Gọi bởi tools/build-audio.js: đọc danh sách câu (JSON) và tạo mp3 bằng edge-tts.
import asyncio, json, os, sys
import edge_tts

async def one(job, sem):
    async with sem:
        for attempt in range(4):
            try:
                await asyncio.wait_for(edge_tts.Communicate(job['text'], job['voice'], rate=job['rate']).save(job['file']), 60)
                return True
            except Exception as e:
                if os.path.exists(job['file']):
                    os.remove(job['file'])  # không để lại file rỗng
                if attempt == 3:
                    print('Lỗi:', job['text'][:20], e, file=sys.stderr)
                await asyncio.sleep(1 + attempt * 2)
        return False

async def main(path):
    jobs = json.load(open(path, encoding='utf-8'))
    sem = asyncio.Semaphore(8)
    done = 0
    async def run(j):
        nonlocal done
        await one(j, sem)
        done += 1
        if done % 100 == 0 or done == len(jobs):
            print(f'  {done}/{len(jobs)}', flush=True)
    await asyncio.gather(*(run(j) for j in jobs))

asyncio.run(main(sys.argv[1]))
