FROM python:3.11-slim

WORKDIR /app

ENV PYTHONPATH=/app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN sed -i 's/\r$//' bootstrap.sh && chmod +x bootstrap.sh

CMD ["/bin/bash", "./bootstrap.sh"]