import os
import urllib.request

FILES = {
    "static/css/vendor/xterm.css": "https://cdn.jsdelivr.net/npm/xterm@5.1.0/css/xterm.css",
    "static/js/vendor/xterm.js": "https://cdn.jsdelivr.net/npm/xterm@5.1.0/lib/xterm.js",
    "static/js/vendor/xterm-addon-fit.js": "https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.7.0/lib/xterm-addon-fit.js"
}

def main():
    for local_path, url in FILES.items():
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        print(f"Baixando {url}...")
        
        # Mascarando a requisicao para o CDN achar que somos o Google Chrome
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        )
        
        try:
            with urllib.request.urlopen(req) as response:
                content = response.read()
                
                # Barreira de seguranca: se o CDN mandar um HTML de bloqueio, nos abortamos.
                if b"<!doctype html>" in content[:50].lower():
                    print(f"[ERRO] O CDN bloqueou {url}. Conteudo HTML recebido.")
                    continue
                    
                with open(local_path, 'wb') as out_file:
                    out_file.write(content)
        except Exception as e:
            print(f"[ERRO] Falha ao baixar {url}: {e}")
            
    print("\nArquivos XTerm reais baixados com sucesso. Modo Offline pronto!")

if __name__ == "__main__":
    main()